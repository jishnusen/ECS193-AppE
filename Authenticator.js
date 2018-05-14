const process = require('process');
const express = require('express');
const Knex = require('knex');
const mailjet = require('node-mailjet');
const https = require('https');
const {google} = require('googleapis');
const randomstring = require('randomstring');
const util = require('./util.js');
const crypto = require('crypto');
const AccountHandler = require('./AccountHandler.js');

var CLIENT_IDS = [];
if (process.env.NODE_ENV != 'production')
{
    process.env.CLIENT_ID = '671445578517-ogrl80hb1pnq5ruirarvjsmvd8th2hjp.apps.googleusercontent.com';
    process.env.CLIENT_ELEC_ID = '671445578517-io87npos82nmk6bk24ttgikc9h4uls4l.apps.googleusercontent.com';
    process.env.CLIENT_WEB_SECRET = 'K6gGjixzDWcT18inlGLnydQv';
}
CLIENT_IDS = [process.env.CLIENT_ID, process.env.CLIENT_ELEC_ID];

const auth = google.auth;
var client = new auth.OAuth2(process.env.CLIENT_ID, process.env.CLIENT_WEB_SECRET, 'http://localhost');

var lastCheckedTime = Date.now(); //implementation of "lazy timer"
const thirtyMinutes = 1800000;
const sixtyMinutes = thirtyMinutes*2;

function exchangeAuthCode (knex, req, res)
{
    var accessToken = '';
    var refreshToken = '';

    client.getToken(req.body.authCode, function (err, tokens) {
        if (err)
        {
            console.log(err);
            util.respond(res, 400, JSON.stringify({err: 'Error getting tokens'}));
            return;
        }

        accessToken = tokens.access_token;
        refreshToken = tokens.refresh_token;

        var httpsOptions = {
            hostname: 'www.googleapis.com',
            port: 443,
            path: '/oauth2/v1/userinfo?access_token=' + accessToken,
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        };

        var httpsReq = https.request(httpsOptions, httpsCB);
        httpsReq.on('error', function(err) {
            console.log('problem with request: ' + err.message);
        });
        httpsReq.end();
    });

    function httpsCB (cbRes)
    {
        cbRes.setEncoding('utf8');
        cbRes.on('data', function (cbBody) {
            var retObj = JSON.parse(cbBody);

            if (retObj.hasOwnProperty('error'))
            {
                util.respond(res, 401, JSON.stringify({err: 'Invalid Token'}));
                return;
            }

            var email = retObj.email;
            knex('patients')
                .select()
                .where('email', email)
                .then(function (rows) {
                    if (rows.length == 0)
                        util.respond(res, 401, JSON.stringify({err: 'Invalid Credentials'}));
                    else
                    {
                        var data = {
                            accessToken: accessToken,
                            refreshToken: refreshToken,
                            patientID: rows[0].id
                        };
                        util.respond(res, 200, JSON.stringify(data));
                    }
                });
        });
    }
}

function getAuthForToken (knex, req, res)
{
    var accessToken = req.body.accessToken;
    var email = '';
    var retObj = null;

    var httpsOptions = {
        hostname: 'www.googleapis.com',
        port: 443,
        path: '/oauth2/v1/userinfo?access_token=' + accessToken,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    };

    var httpsReq = https.request(httpsOptions, httpsCB);
    httpsReq.on('error', function(err) { console.log('problem with request: ' + err.message); });
    httpsReq.end();

    function httpsCB (cbRes)
    {
        cbRes.setEncoding('utf-8');
        cbRes.on('data', function (cbBody) {
            var retObj = JSON.parse(cbBody);
            if (retObj.hasOwnProperty('error'))
                util.respond(res, 400, JSON.stringify({err: 'Access Token Invalid'}));
            else
            {
                email = retObj.email;
                checkEmail(knex, email, emailCB);
            }
        });
    }

    function emailCB (cbRes)
    {
        if (cbRes.hasOwnProperty('err'))
        {
            util.respond(res, 401, JSON.stringify(cbRes));
            return;
        }

        var accType = cbRes.accType;
        var randStr = randomstring.generate(32);
        var hash = crypto.createHash('sha256');
        hash.update(randStr, 'utf8');
        var digest = hash.digest('hex');
        retObj = {
            id: -1,
            email: email,
            accType: accType,
            name: '',
            authCode: randStr
        };
        if (accType != 'patient')
        {
            retObj.name = cbRes.name;
            retObj.id = cbRes.id;
        }
        if (accType == 'patient')
            retObj.id = cbRes.patientID;
        
        LoginSweeper(knex, cb);
        var requestor = {
            accType: accType,
            email: email
        };
        AccountHandler.updateLastLogin(knex, requestor, null, false);
        function cb() { addAuthentication(knex, email, accType, digest, addCB); }
    }

    function addCB (cbRes)
    {
        if (cbRes)
            util.respond(res, 200, JSON.stringify(retObj));
        else
            util.respond(res, 400, JSON.stringify({err: 'Adding Auth Code Fail'}));
    }
}

/**
 * Adds digest hash to database
 * Session is set to valid and will last 60 minutes
 * @param {*} knex - database handler
 * @param {*} email - user email
 * @param {*} accType - user account type
 * @param {*} digest - valid session hash for users
 * @param {*} cb - callack on successful validation
 */
function addAuthentication (knex, email, accType, digest, cb)
{
    var table = 'faculty';
    if (accType == 'patient')
        table = 'patients';
    
    knex(table)
        .select()
        .where('email', email)
        .then((rows) => {
            if (rows.length == 0)
                cb(false);
            else
            {
                knex(table)
                    .where('email', email)
                    .update({'digest':digest, 'expire': false})
                    .then(() => { cb(true); });
            }
        });
}
/**
 * Kills timed out clients
 * @param {*} cb - function call on success
 */
function LoginSweeper (knex, cb)
{
    var curTime = Date.now();
    var lastPlusThirty = lastCheckedTime + thirtyMinutes;
    var lastPlusSixty = lastCheckedTime + sixtyMinutes;
    var finishCnt = 0;
    
    if (lastPlusSixty < curTime )
    {
        knex('faculty')
            .update({'digest': 'null', 'expire': false})
            .then(() => {});
        knex('patients')
            .update({'digest': 'null', 'expire': false})
            .then(() => {});
        lastCheckedTime = curTime;
        return;
    }
    else if (lastPlusThirty < curTime)
    {
        knex('faculty')
            .where('expire', true)
            .update({'digest': 'null', 'expire': false})
            .then(() => {
                knex('faculty')
                    .whereNot('digest', 'null')
                    .update('expire', true)
                    .then(() => {
                        finishCnt++;
                        onTimerCheck();
                    });
            });
        knex('patients')
            .where('expire', true)
            .update({'digest': 'null', 'expire': false})
            .then(() => {
                knex('patients')
                    .whereNot('digest', 'null')
                    .update('expire', true)
                    .then(() => {
                        finishCnt++;
                        onTimerCheck();
                    });
            });
        lastCheckedTime = curTime;
    }
    else
    {
        finishCnt = 2;
        onTimerCheck();
    }

    function onTimerCheck()
    {
        if (finishCnt < 2)
            return;
        cb();
    }
}

/**
 * Validates digest
 * @param {*} knex  - database handler
 * @param {*} req - request body
 * @param {*} cb - funct to call on success
 */
function getRequestor (knex, req, cb)
{
    var authCode = req.body.authCode;
    var hash = crypto.createHash('sha256');
    hash.update(authCode, 'utf8');
    var digest = hash.digest('hex');

    LoginSweeper(knex ,onSweep);

    function onSweep ()
    {
        //console.log('Body:');
        //console.log(req.body);
        //console.log('Hash:');
        //console.log(digest);

        knex('faculty')
            .select()
            .where('digest', digest)
            .then((frows) => {
                //console.log(frows);
                if (frows.length > 0)
                {
                    var retObj = {
                        email: frows[0].email,
                        accType: frows[0].accType,
                        name: frows[0].name,
                        id: frows[0].id
                    };
                    cb(retObj);
                    knex('faculty')
                        .where('digest', digest)
                        .update('expire', false) //refreshes expiration since session is still valid.
                        .then(() => {});
                }
                else
                {
                    knex('patients')
                        .select()
                        .where('digest', digest)
                        .then((prows) => {
                            if (prows.length > 0)
                            {
                                var retObj = {
                                    email: prows[0].email,
                                    accType: 'patient',
                                    patientID: prows[0].id
                                };
                                cb(retObj);
                                knex('patients')
                                    .where('digest', digest)
                                    .update('expire', false) //refreshes expiration since session is still valid.
                                    .then(() => {});
                            }
                            else
                            {
                                cb({err: 'Invalid Auth Code'});
                            }
                        });
                }
            });
    }
}

function revokeAuthentication (knex, req, res)
{
    var email = req.body.email;
    var authCode = req.body.authCode;
    var accType = req.body.accType;
    validateAuthCode();

    function validateAuthCode ()
    {
        var hash = crypto.createHash('sha256');
        hash.update(authCode, 'utf8');
        var digest = hash.digest('hex');
        var table = 'faculty';
        if (accType == 'patient')
            table = 'patients';
        
        knex(table)
            .select()
            .where({
                email: email,
                digest: digest
            })
            .then((rows) => {
                if (rows.length > 0)
                    validCB();
                else
                    util.respond(res, 401, JSON.stringify({err: 'Bad Credentials'}));
            });
    }

    function validCB ()
    {
        var table = 'faculty';
        if (accType == 'patient')
            table = 'patients';
        knex(table)
            .where('email', email)
            .update({'digest': 'null', 'expire': false})
            .then(() => {
                util.respond(res, 200, JSON.stringify({body: 'Authentication Revoked'}));
            });
    }
}

function checkEmail (knex, email, cb)
{
    knex('faculty')
        .select()
        .where('email', email)
        .then((frows) => {
            if (frows.length > 0)
                cb({
                    accType: frows[0].accType,
                    name: frows[0].name,
                    id: frows[0].id
                });
            else
            {
                knex('patients')
                    .select()
                    .where('email', email)
                    .then((prows) => {
                        if (prows.length > 0)
                            cb({
                                accType: 'patient',
                                patientID: prows[0].id
                            });
                        else
                            cb({err: 'No user exists'});
                    });
            }
        });
}

module.exports.exchangeAuthCode = exchangeAuthCode;

module.exports.getAuthForToken = getAuthForToken;
module.exports.revokeAuthentication = revokeAuthentication;
module.exports.getRequestor = getRequestor;