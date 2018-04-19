const process = require('process');
const express = require('express');
const Knex = require('knex');
const mailjet = require('node-mailjet');
const https = require('https');
const randomstring = require('randomstring');
const InsertRequestHandler = require('./InsertRequestHandler.js');
const util = require('./util.js');
const Authenticator = require('./Authenticator.js');

var CLIENT_IDS = [];
if (process.env.NODE_ENV != 'production')
{
    process.env.CLIENT_ID = '671445578517-ogrl80hb1pnq5ruirarvjsmvd8th2hjp.apps.googleusercontent.com';
    process.env.CLIENT_ELEC_ID = '671445578517-io87npos82nmk6bk24ttgikc9h4uls4l.apps.googleusercontent.com';
}
CLIENT_IDS = [process.env.CLIENT_ID, process.env.CLIENT_ELEC_ID, process.env.CLIENT_EMAILER];

var validationPairs = [];
validationPairs.push('adminDoctor-admin');
validationPairs.push('adminDoctor-doctor');
validationPairs.push('adminDoctor-patient');
validationPairs.push('admin-admin');
validationPairs.push('admin-doctor');
validationPairs.push('doctor-patient');

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

function sendEmail (knex, req, res)
{
    var body = req.body;

    if (process.env.NODE_ENV != 'production')
    {
        process.env.MAILJET_PUBLIC = '524c051f4fb254ae5636592655d92194';
        process.env.MAILJET_PRIVATE = '0b74bf7ddd333cad1d75c2dd2570cd7a';
    }

    var newAccType = body.newAccType;
    var toEmail = body.recipientEmail;
    var toName = body.recipientName;
    var fromEmail = '';

    checkAccountExists(knex, toEmail, accExistance);

    function accExistance (exists)
    {
        if (exists)
        {
            util.respond(res, 400, JSON.stringify({err: 'Account Already Exists for Email'}));
            return;
        }
        Authenticator.getRequestor(knex, req, gotRequestor);
    }

    function gotRequestor (requestor)
    {
        if (requestor.hasOwnProperty('err'))
        {
            util.respond(res, 401, JSON.stringify({err: 'Bad Auth'}));
            return;
        }

        var accType = requestor.accType;
        var checkPair = accType + '-' + newAccType;
        if (!validationPairs.includes(checkPair))
        {
            util.respond(res, 400, JSON.stringify({err: 'Account type "' + accType + '" cannot add account type "' + newAccType + '"'}));
            return;
        }

        fromEmail = requestor.email;
        if (body.hasOwnProperty('doctorEmail'))
            fromEmail = body.doctorEmail;

        var randStr = randomstring.generate(64);

        updateVerifyLink(randStr);

        var host = 'https://majestic-legend-193620.appspot.com';

        var mailData = {
            'Messages': [{
                'From': {
                    'Email': 'nicholas.michael.ng@gmail.com',
                    'Name': 'Nicholas Ng'
                },
                'To': [{
                    'Email': toEmail,
                    'Name': toName
                }],
                'Subject': 'Account Activation',
                'TextPart': randStr,
                'HtmlPart': '<a href="' + host + '/account/validate?v=' + randStr + '">Hello There</a>'
            }]   
        };

        var mailer = mailjet.connect(process.env.MAILJET_PUBLIC, process.env.MAILJET_PRIVATE);

        var request = mailer.post('send', { 'version': 'v3.1' }).request(mailData);
        request
            .then(function (result) {
                //console.log(result.body);
                util.respond(res, 200, JSON.stringify({body: 'EMAIL SENT'}));
            })
            .catch(function (err) {
                //console.log(err);
                util.respond(res, 400, JSON.stringify({err: 'ERROR ON SEND'}));
            });
    }

    function updateVerifyLink (str)
    {
        checkActiveVerification(knex, toEmail, activationExistance);

        function activationExistance (exists)
        {
            if (exists)
            {
                knex('pendingVerification')
                    .where('to', toEmail)
                    .update('code', str)
                    .then(function() {});
                knex('pendingVerification')
                    .where('to', toEmail)
                    .update('from', fromEmail)
                    .then(function() {});
                knex('pendingVerification')
                    .where('to', toEmail)
                    .update('accType', newAccType)
                    .then(function() { /*console.log('Updated');*/ });
            }
            else
            {
                var data = {
                    code: str,
                    from: fromEmail,
                    to: toEmail,
                    name: toName,
                    accType: newAccType
                };

                knex('pendingVerification')
					.insert(data)
					.catch((err) => { console.log(err); })
					.then(function() { /*console.log('Insert');*/ });
            }
        }
    }
}

function insertVerify (knex, req, res)
{
	if (!req.query.hasOwnProperty('v'))
	{
        util.respond(res, 400, JSON.stringify({err: 'Insert verification link form invalid.'}));
		return;
	}
    
    var v = req.query.v;

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
        //console.log(row);
        if (row.activeCode == 0)
        {
            util.respond(res, 400, JSON.stringify({err: 'Verification code invalid.'}));
            return;
        }

        knex('pendingVerification')
            .where('to', row.to)
            .update('code', '0')
            .then(function() {});
        
        var accType = row.accType;
        var email = row.to;
        var parent = row.from;
        var name = row.name;

        if (accType == 'adminDoctor' || accType == 'admin' || accType == 'doctor')
        {
            var data = {
                email: email,
                name: name,
                accType: accType
            };
            InsertRequestHandler.insertFaculty(knex, data, res);
        }
        else if (accType == 'patient')
        {
            var data = {
                email: email,
                doctorEmail: parent,
                param: 0
            };
            InsertRequestHandler.insertPatient(knex, data, res);
        }
    }
}

module.exports.sendEmail = sendEmail;
module.exports.insertVerify = insertVerify;