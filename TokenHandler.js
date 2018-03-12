var process = require('process');
var express = require('express');
var Knex = require('knex');
var mailjet = require('node-mailjet');
var https = require('https');
const {google} = require('googleapis');

var CLIENT_IDS = [];
if (process.env.NODE_ENV != 'production')
{
    process.env.CLIENT_ID = '671445578517-ogrl80hb1pnq5ruirarvjsmvd8th2hjp.apps.googleusercontent.com';
    process.env.CLIENT_ELEC_ID = '671445578517-io87npos82nmk6bk24ttgikc9h4uls4l.apps.googleusercontent.com';
    process.env.CLIENT_WEB_SECRET = 'K6gGjixzDWcT18inlGLnydQv';
}
CLIENT_IDS = [process.env.CLIENT_ID, process.env.CLIENT_ELEC_ID, process.env.CLIENT_EMAILER];

var auth = google.auth;
var client = auth.OAuth2(process.env.CLIENT_ID, process.env.CLIENT_WEB_SECRET, 'http://localhost');

function exchangeAuthCode (knex, req, res)
{
    var accessToken = '';
    var refreshToken = '';

    client.getToken(req.body.authCode, function (err, tokens) {
        if (err)
        {
            console.log(err);
            res.status(400)
                .set('Content-Type', 'text/plain')
                .send('Error getting tokens')
                .end();
            return;
        }

        //console.log(tokens);
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
                res.status(401)
                    .set('Content-Type', 'text/plain')
                    .send('Invalid Token')
                    .end();
                return;
            }

            var email = retObj.email;
            knex('patients')
                .select()
                .where('email', email)
                .then(function (rows) {
                    if (rows.length == 0)
                    {
                        res.status(401)
                            .set('Content-Type', 'text/plain')
                            .send('Invalid Credentials')
                            .end();
                    }
                    else
                    {
                        var data = {
                            accessToken: accessToken,
                            refreshToken: refreshToken,
                            patientID: rows[0].id
                        };
                        res.status(200)
                            .set('Content-Type', 'text/plain')
                            .send(JSON.stringify(data))
                            .end();
                    }
                });
        });
    }
}

module.exports.checkUserExists = checkUserExists;
module.exports.exchangeAuthCode = exchangeAuthCode;