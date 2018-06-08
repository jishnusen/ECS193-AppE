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

//oauth client ids set for local testing
var CLIENT_IDS = [];
//NODE_ENV is set to 'production' when deployed on app engine, so this block only runs locally
if (process.env.NODE_ENV != 'production')
{
    process.env.CLIENT_ID = '671445578517-ogrl80hb1pnq5ruirarvjsmvd8th2hjp.apps.googleusercontent.com';
    process.env.CLIENT_ELEC_ID = '671445578517-io87npos82nmk6bk24ttgikc9h4uls4l.apps.googleusercontent.com';
    process.env.CLIENT_WEB_SECRET = 'K6gGjixzDWcT18inlGLnydQv';
}
CLIENT_IDS = [process.env.CLIENT_ID, process.env.CLIENT_ELEC_ID];

const auth = google.auth;
var client = new auth.OAuth2(process.env.CLIENT_ID, process.env.CLIENT_WEB_SECRET, 'http://localhost');

var lastCheckedTime = Date.now(); //implementation of timer
const thirtyMinutes = 1800000; //ms in 30 minutes
const sixtyMinutes = thirtyMinutes*2;

/*
 * Takes Google OAuth access token and returns a unique authorization code to be used for any future requests
 * Called when a client is logging in
 */
function getAuthForToken (knex, req, res)
{
    var accessToken = req.body.accessToken;
    var email = '';
    var retObj = null;

    var httpsOptions = { //Object to send to googles servers to check for access token validity
        hostname: 'www.googleapis.com',
        port: 443,
        path: '/oauth2/v1/userinfo?access_token=' + accessToken, //path for site
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    };

    //sends https request with above object
    var httpsReq = https.request(httpsOptions, httpsCB);
    httpsReq.on('error', function(err) { console.log('problem with request: ' + err.message); });
    httpsReq.end();

    //Called when receiving response from google servers
    function httpsCB (cbRes)
    {
        cbRes.setEncoding('utf-8');
        cbRes.on('data', function (cbBody) {
            var retObj = JSON.parse(cbBody);
            if (retObj.hasOwnProperty('error')) //if access token validation errored
                util.respond(res, 400, JSON.stringify({err: 'Access Token Invalid'}));
            else
            {
                //next check to make sure the email associated with the access token is in our database as a user
                email = retObj.email;
                checkEmail(knex, email, emailCB);
            }
        });
    }

    //Called after checking if email exists as account
    function emailCB (cbRes)
    {
        if (cbRes.hasOwnProperty('err')) //if email does not exist as a user in our database
        {
            //send back error object
            util.respond(res, 401, JSON.stringify(cbRes));
            return;
        }

        //create a random 32 alphanumeric character long string
        //this will act somewhat like a symmetic key when making requests
        var accType = cbRes.accType;
        var randStr = randomstring.generate(32);

        //hash the string using sha256
        var hash = crypto.createHash('sha256');
        hash.update(randStr, 'utf8');
        var digest = hash.digest('hex');

        //setting the object we will return back to the client logging in
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
        
        //Sweeps for inactive users in the database
        LoginSweeper(knex, cb);

        //Logs this as the last time this client logged in
        var requestor = {
            accType: accType,
            email: email
        };
        AccountHandler.updateLastLogin(knex, requestor, null, false);

        //Add the hash digest to the database for later client authentication
        function cb() { addAuthentication(knex, email, accType, digest, addCB); }
    }

    //Callback for adding authentication to database
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
    
    //forcably logs out all clients
    //this occurs when no client has made a request in the past sixty minutes
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
    //forcably logs out any clients with the expire flag set to true
    //sets all other account expire flags to true
    //this occurs when the last time we checked the database for logins was over thirty minutes ago
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

    //calls the callback function passed in through function parameters
    function onTimerCheck()
    {
        if (finishCnt < 2)
            return;
        cb();
    }
}

/**
 * Validates authorization code
 * @param {*} knex  - database handler
 * @param {*} req - request body
 * @param {*} cb - funct to call on success
 */
function getRequestor (knex, req, cb)
{
    //hashes authorization code sent by client
    var authCode = req.body.authCode;
    var hash = crypto.createHash('sha256');
    hash.update(authCode, 'utf8');
    var digest = hash.digest('hex');

    //Sweeps for inactive users in the database
    LoginSweeper(knex ,onSweep);

    function onSweep ()
    {
        //Check faculty table for matching hash
        knex('faculty')
            .select()
            .where('digest', digest)
            .then((frows) => {
                if (frows.length > 0)
                {
                    //if match is found
                    var retObj = {
                        email: frows[0].email,
                        accType: frows[0].accType,
                        name: frows[0].name,
                        id: frows[0].id
                    };
                    //calls back with information about the requestor
                    cb(retObj);
                    //refreshes expiration since session is still valid.
                    knex('faculty')
                        .where('digest', digest)
                        .update('expire', false) 
                        .then(() => {});
                }
                else
                {
                    //if match is not found
                    //check patient table for matching hash
                    knex('patients')
                        .select()
                        .where('digest', digest)
                        .then((prows) => {
                            if (prows.length > 0)
                            {
                                //if match is found
                                var retObj = {
                                    email: prows[0].email,
                                    accType: 'patient',
                                    patientID: prows[0].id
                                };
                                //calls back with information about the requestor
                                cb(retObj);
                                //refreshes expiration since session is still valid.
                                knex('patients')
                                    .where('digest', digest)
                                    .update('expire', false) 
                                    .then(() => {});
                            }
                            else
                            {
                                //if no math is found, call back with an err
                                cb({err: 'Invalid Auth Code'});
                            }
                        });
                }
            });
    }
}

//checks to make sure requestor is valid, then sets their hash digest to 'null'
function revokeAuthentication (knex, req, res)
{
    //get information in request
    var email = req.body.email;
    var authCode = req.body.authCode;
    var accType = req.body.accType;
    validateAuthCode();

    //validates the requestors authentication code
    function validateAuthCode ()
    {
        //hash the authentication code
        var hash = crypto.createHash('sha256');
        hash.update(authCode, 'utf8');
        var digest = hash.digest('hex');

        //sets the table to check
        var table = 'faculty';
        if (accType == 'patient')
            table = 'patients';
        
        //checks table for matching hash
        knex(table)
            .select()
            .where({
                email: email,
                digest: digest
            })
            .then((rows) => {
                if (rows.length > 0) //if match is found
                    validCB();
                else //if no match is found, resond with err
                    util.respond(res, 401, JSON.stringify({err: 'Bad Credentials'}));
            });
    }

    //sets the hash to 'null'
    function validCB ()
    {
        //gets table to query
        var table = 'faculty';
        if (accType == 'patient')
            table = 'patients';
        
        //sets the hash to 'null'
        knex(table)
            .where('email', email)
            .update({'digest': 'null', 'expire': false})
            .then(() => {
                util.respond(res, 200, JSON.stringify({body: 'Authentication Revoked'}));
            });
    }
}

//checks to see if email exists in the database
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

//exported functions
module.exports.exchangeAuthCode = exchangeAuthCode;
module.exports.getAuthForToken = getAuthForToken;
module.exports.revokeAuthentication = revokeAuthentication;
module.exports.getRequestor = getRequestor;