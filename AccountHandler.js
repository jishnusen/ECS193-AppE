const process = require('process');
const express = require('express');
const Knex = require('knex');
const mailjet = require('node-mailjet');
const https = require('https');
const randomstring = require('randomstring');
const InsertRequestHandler = require('./InsertRequestHandler.js');
const util = require('./util.js');
const Authenticator = require('./Authenticator.js');

//checks if an email exists within the database
//calls 'cb' with true if exists, false otherwise
function checkAccountExists (knex, email, cb)
{
    knex('faculty')
        .select()
        .where('email', email)
        .then(function (rows) {
            if (rows.length > 0)
            {
                cb(true);
            }
            else
            {
                knex
                    .select()
                    .from('patients')
                    .where('email', email)
                    .then(function (patRows) {
                        if (rows.length > 0)
                            cb(true);
                        else
                            cb(false);
                    });
            }
        });
}

//checks if the email is in the verification table
function checkActiveVerification (knex, to, cb)
{
    knex('pendingVerification')
        .select()
        .where('to', to)
        .then(function (rows) {
            if (rows.length > 0)
                cb(true);
            else
                cb(false);
        });
}

//sends an account activation link via mailjet
function sendEmail (knex, req, res)
{
    var body = req.body;

    //hard setting api keys if running locally
    if (process.env.NODE_ENV != 'production')
    {
        process.env.MAILJET_PUBLIC = '524c051f4fb254ae5636592655d92194';
        process.env.MAILJET_PRIVATE = '0b74bf7ddd333cad1d75c2dd2570cd7a';
    }

    //gathers information from request
    var newAccType = body.newAccType;
    var toEmail = body.recipientEmail;
    var toFamilyName = body.recipientFamilyName;
    var toGivenName = body.recipientGivenName;
    var fromEmail = '';

    //checks if the account already exists
    checkAccountExists(knex, toEmail, accExistance);

    function accExistance (exists)
    {
        //if the account exists
        if (exists)
        {
            //respond with an err
            util.respond(res, 400, JSON.stringify({err: 'Account Already Exists for Email'}));
            return;
        }
        //else get the requestors information
        Authenticator.getRequestor(knex, req, gotRequestor);
    }

    function gotRequestor (requestor)
    {
        //if the requestor was not found in the database
        if (requestor.hasOwnProperty('err'))
        {
            util.respond(res, 401, JSON.stringify({err: 'Bad Auth'}));
            return;
        }

        //if the requestor does not have admin priviledges
        var accType = requestor.accType;
        if (accType != 'admin' && accType != 'adminDoctor')
        {
            //respond with an err
            util.respond(res, 400, JSON.stringify({err: 'Account type "' + accType + '" cannot add account type "' + newAccType + '"'}));
            return;
        }

        //gets who is the request is parented to
        fromEmail = requestor.email;
        if (body.hasOwnProperty('doctorEmail'))
            fromEmail = body.doctorEmail;

        //random alphnumeric sting for use in the verification link
        var randStr = randomstring.generate(64);

        //updates the verification string in database if the 
        updateVerifyLink(randStr);

        //the host of the activation link
        var host = 'https://majestic-legend-193620.appspot.com';
        //var host = 'http://localhost:8080

        //the email's object
        var mailData = {
            'Messages': [{
                'From': {
                    'Email': 'email@email.com', //change this to some mailjet verified email
                    'Name': 'no-reply'
                },
                'To': [{
                    'Email': toEmail,
                    'Name': toGivenName + ' ' + toFamilyName
                }],
                'Subject': 'Account Activation',
                'TextPart': randStr,
                //The body of the email in html
                'HtmlPart': 'To activate your NIBVA account, click<a href="' + host + '/account/validate?v=' + randStr + '">here</a>.'
            }]   
        };

        //mailjet connection
        var mailer = mailjet.connect(process.env.MAILJET_PUBLIC, process.env.MAILJET_PRIVATE);

        //send the email
        var request = mailer.post('send', { 'version': 'v3.1' }).request(mailData);
        request
            .then(function (result) { //on success
                util.respond(res, 200, JSON.stringify({body: 'EMAIL SENT'}));
            })
            .catch(function (err) { //on failure
                util.respond(res, 400, JSON.stringify({err: 'ERROR ON SEND'}));
            });
    }

    //updates the verification string in the database if it exists
    function updateVerifyLink (str)
    {
        //check for existance
        checkActiveVerification(knex, toEmail, activationExistance);

        function activationExistance (exists)
        {
            if (exists) //if exists, update
            {
                knex('pendingVerification')
                    .where('to', toEmail)
                    .update({
                        code: str,
                        from: fromEmail,
                        familyName: toFamilyName,
                        givenName: toGivenName,
                        accType: newAccType
                    })
                    .then(function() {});
            }
            else //if not, create
            {
                var data = {
                    code: str,
                    from: fromEmail,
                    to: toEmail,
                    familyName: toFamilyName,
                    givenName: toGivenName,
                    accType: newAccType
                };

                knex('pendingVerification')
					.insert(data)
					.catch((err) => { console.log(err); })
					.then(function() {});
            }
        }
    }
}

//function called when verification link is visited
function insertVerify (knex, req, res)
{
    //if malformed link
	if (!req.query.hasOwnProperty('v'))
	{
        //respond with error
        util.respond(res, 400, JSON.stringify({err: 'Insert verification link form invalid.'}));
		return;
	}
    
    //verification string
    var v = req.query.v;

    //check for code inside of verification table
    knex
        .select()
        .from('pendingVerification')
        .where('code', v)
        .then(function(rows) {
            if (rows.length > 0)
                validCode(rows[0]);
            else
                util.respond(res, 400, JSON.stringify({err: 'Insert verification code invalid'}));
        });
    
    function validCode (row)
    {
        //if the code is inactive
        if (row.activeCode == 0)
        {
            //respond with err
            util.respond(res, 400, JSON.stringify({err: 'Verification code invalid.'}));
            return;
        }

        //update verification code to be '0'
        knex('pendingVerification')
            .where('to', row.to)
            .update('code', '0')
            .then(function() {});
        
        var accType = row.accType;
        var email = row.to;
        var parent = row.from;
        var familyName = row.familyName;
        var givenName = row.givenName;

        //if making a staff account
        if (accType == 'adminDoctor' || accType == 'admin' || accType == 'doctor')
        {
            //insert new account into faculty table
            var data = {
                email: email,
                familyName: familyName,
                givenName: givenName,
                accType: accType,
                digest: 'null',
                expire: 0
            };
            InsertRequestHandler.insertFaculty(knex, data, res);
        }
        //if making a patient account
        else if (accType == 'patient')
        {
            //insert new account into patient table
            var data = {
                email: email,
                familyName: familyName,
                givenName: givenName,
                doctorEmail: parent,
                digest: 'null',
                expire: 0,
                param: 0
            };
            InsertRequestHandler.insertPatient(knex, data, res);
        }
    }
}

//updates the accounts last login to be the current time
function updateLastLogin (knex, requestor, res, respondFlag)
{
    //the table where to find the account
    var table = 'faculty';
    if (requestor.accType == 'patient')
        table = 'patients';

    //formatting the date
    var date = new Date();
    var y = date.getUTCFullYear();
    var mo = date.getUTCMonth() + 1;
    if (mo < 10)
        mo = '0' + mo;
    var d = date.getUTCDate();
    if (d < 10)
        d = '0' + d;
    var h = date.getUTCHours();
    if (h < 10)
        h = '0' + h;
    var mi = date.getUTCMinutes();
    if (mi < 10)
        mi = '0' + mi;
    var s = date.getUTCSeconds();
    if (s < 10)
        s = '0' + s;
    var time = y + '-' + mo + '-' + d + ' ' + h + ':' + mi + ':' + s;
    
    //update the appropriate cell in the table
    knex(table)
        .where('email', requestor.email)
        .update('lastLogin', time)
        .then(() => {
            if (respondFlag) util.respond(res, 200, JSON.stringify({body: 'Updated'}));
        });
}

//function exports
module.exports.sendEmail = sendEmail;
module.exports.insertVerify = insertVerify;
module.exports.updateLastLogin = updateLastLogin;