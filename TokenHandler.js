var process = require('process');
var express = require('express');
var Knex = require('knex');
var mailjet = require('node-mailjet');
var https = require('https');

var CLIENT_IDS = [];
if (process.env.NODE_ENV != 'production')
{
    process.env.CLIENT_ID = '671445578517-ogrl80hb1pnq5ruirarvjsmvd8th2hjp.apps.googleusercontent.com';
    process.env.CLIENT_ELEC_ID = '671445578517-io87npos82nmk6bk24ttgikc9h4uls4l.apps.googleusercontent.com';
}
CLIENT_IDS = [process.env.CLIENT_ID, process.env.CLIENT_ELEC_ID, process.env.CLIENT_EMAILER];

function checkUserExists (knex, req, res) 
{
    console.log('Checking Token...');

    var body = req.body;

    token = body['idToken'];

    const {OAuth2Client} = require('google-auth-library');
    const client = new OAuth2Client(process.env.CLIENT_ID);

    async function verify() {  // decalartion of anonymous function
        try {
            const ticket = await client.verifyIdToken({
                idToken: token,
                audience: CLIENT_IDS  // Specify the CLIENT_ID of the app that accesses the backend
                // Or, if multiple clients access the backend:
                //[CLIENT_ID_1, CLIENT_ID_2, CLIENT_ID_3]
            });
            const payload = ticket.getPayload(); //retrieves oauth2 verification
            // console.log(ticket);
            // console.log(payload);
            const userid = payload['sub']; 
            const email = payload['email'];

            if (email == null || userid == null) 
            {
                res.status(400)
                    .set('Content-Type', 'text/plain')
                    .send("Email not found in payload!")
                    .end();
                return;
            }

            knex //checks if email exists in database and then matches the id
                .select()
                .from('faculty')
                .where('email', email)
                .then(function (results) {
                    var rows = results.map((row) => { return row; });
                    if (rows.length == 1) // token belongs to a doctor or administator
                    {
                        //console.log("Authorized");

                        var resObj = {
                            accType: rows[0].accType,
                            email: email,
                            name: rows[0].name
                        };

                        res.status(200)
                            .set('Content-Type', 'text/plain')
                            .send(JSON.stringify(resObj))
                            .end();
                    }
                    else if (rows.length == 0) // no match within faculty table, lets check if the token belongs to a patient
                    {
                        knex
                            .select()
                            .from('patients')
                            .where('email', email)
                            .then(function (resultsPat) {
                                var ids = resultsPat.map((row) => { return row.id; });
                                if (ids.length == 1) // this token belongs to a patient
                                {
                                    //console.log("Authorized");

                                    var resObj = {
                                        accType: 'patient',
                                        email: email,
                                        id: ids[0]
                                    };

                                    res.status(200)
                                        .set('Content-Type', 'text/plain')
                                        .send(JSON.stringify(resObj))
                                        .end();
                                }
                                else 
                                {
                                    //console.log("Unauthorized");
                                    // errmsg += "Table: " + table_name + " does not exist.\n";
                                    res.status(403)
                                        .set('Content-Type', 'text/plain')
                                        .send("Unauthorized")
                                        .end();
                                }
                            });
                    }
                    else // this should never happen... (we dont allow two rows with the same email.)
                    {
                        //console.log("Unauthorized");
                        // errmsg += "Table: " + table_name + " does not exist.\n";
                        res.status(403)
                            .set('Content-Type', 'text/plain')
                            .send("Unauthorized")
                            .end();
                    }
                });
        }
        catch(e) 
        {
            console.log('Auth: FAILURE');

            res.status(403)
                .set('Content-Type', 'text/plain')
                .send("BAD AUTH")
                .end();
        }
          // If request specified a G Suite domain:
          //const domain = payload['hd'];
    }
    verify(); //call the function we just made
}

function exchangeAuthCode (knex, req, res)
{
    const {OAuth2Client} = require('google-auth-library');
    const client = new OAuth2Client(process.env.CLIENT_ID);

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
                            refreshToken: refreshToken
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