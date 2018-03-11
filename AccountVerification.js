const process = require('process');
const express = require('express');
const Knex = require('knex');
const mailjet = require('node-mailjet');
const https = require('https');
const randomstring = require('randomstring');
const InsertRequestHandler = require('./InsertRequestHandler.js');

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

function checkTokenPriviledges (knex, accessToken, cb)
{
    var httpsOptions = {
        hostname: 'www.googleapis.com',
        port: 443,
        path: '/oauth2/v1/tokeninfo?access_token=' + accessToken,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    };

    var httpsReq = https.request(httpsOptions, httpsCB);
    httpsReq.on('error', function(err) {
        console.log('problem with request: ' + err.message);
    });
    httpsReq.end();

    function httpsCB (res)
    {
        res.setEncoding('utf8');
        res.on('data', function (cbBody) {
            var retObj = JSON.parse(cbBody);
            if (retObj.hasOwnProperty('error'))
            {
                cb('invalid', '');
                return;
            }
            var email = retObj.email;
            knex
                .select()
                .from('faculty')
                .where('email', email)
                .then(function (rows) {
                    if (rows.length > 0)
                    {
                        cb(rows[0].accType, email);
                    }
                    else
                    {
                        knex
                            .select()
                            .from('patients')
                            .where('email', email)
                            .then(function (patRows) {
                                if (rows.length > 0)
                                    cb('patient', email);
                                else
                                    cb('invalid', '');
                            });
                    }
                });
        });
    }
}

function checkAccountExists (knex, email, cb)
{
    knex
        .select()
        .from('faculty')
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
    knex
        .select()
        .from('pendingVerification')
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

    var accessToken = body['accessToken'];
    var newAccType = body['newAccType'];
    var toEmail = body['recipientEmail'];
    var toName = body['recipientName'];
    var fromEmail = '';

    checkAccountExists(knex, toEmail, accExistance);

    function accExistance (exists)
    {
        if (exists)
        {
            res.status(400)
                .set('Content-Type', 'text/plain')
                .send("Account Already Exists for Email")
                .end();
            return;
        }
        checkTokenPriviledges(knex, accessToken, accRetrieved);
    }

    function accRetrieved (accType, from)
    {
        if (accType == 'invalid')
        {
            res.status(400)
                .set('Content-Type', 'text/plain')
                .send("Invalid Credentials")
                .end();
            return;
        }

        var checkPair = accType + '-' + newAccType;
        if (!validationPairs.includes(checkPair))
        {
            res.status(400)
                .set('Content-Type', 'text/plain')
                .send("Account type '" + accType + "' cannot add account type '" + newAccType + "'")
                .end();
            return;
        }

        fromEmail = from;

        var randStr = randomstring.generate(64);

        updateVerifyLink(randStr);

        var host = 'https://majestic-legend-193620.appspot.com';
        //var host = 'http://localhost:8080';

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
                'HtmlPart': '<a href="' + host + '/validate?v=' + randStr + '">Hello There</a>'
            }]   
        };

        var mailer = mailjet.connect(process.env.MAILJET_PUBLIC, process.env.MAILJET_PRIVATE);

        var request = mailer.post('send', { 'version': 'v3.1' }).request(mailData);
        request
            .then(function (result) {
                //console.log(result.body);
                res.status(200)
                    .set('Content-Type', 'text/plain')
                    .send("EMAIL SENT")
                    .end();
            })
            .catch(function (err) {
                //console.log(err);
                res.status(400)
                    .set('Content-Type', 'text/plain')
                    .send("ERROR ON SEND")
                    .end();
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
		res.status(400)
			.set('Content-Type', 'text/plain')
			.send('Insert verification link form invalid.')
			.end();
		return;
	}
    
    var v = req.query.v;

    knex
        .select()
        .from('pendingVerification')
        .where('code', v)
        .then(function(rows) {
            if (rows.length > 0)
            {
                validCode(rows[0]);
            }
            else
            {
                res.status(400)
                    .set('Content-Type', 'text/plain')
                    .send('Insert verification code invalid.')
                    .end();
            }
        });
    
    function validCode (row)
    {
        //console.log(row);
        if (row.activeCode == 0)
        {
            res.status(400)
                .set('Content-Type', 'text/plain')
                .send('Verification code invalid.')
                .end();
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