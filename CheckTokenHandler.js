var process = require('process');
var express = require('express');
var Knex = require('knex');

function checkToken (knex, req, res) {
    console.log('Checking Token...');

    var body = req.body;

    var CLIENT_IDS = [];
    if (process.env.NODE_ENV != 'production')
    {
        process.env.CLIENT_ID = '671445578517-ogrl80hb1pnq5ruirarvjsmvd8th2hjp.apps.googleusercontent.com';
        process.env.CLIENT_ELEC_ID = '671445578517-ju2jvd1beiofp9qqddn3cn6ai1dehmru.apps.googleusercontent.com';
    }
    CLIENT_IDS = [process.env.CLIENT_ID, process.env.CLIENT_ELEC_ID];

    token = body['idToken'];

    const {OAuth2Client} = require('google-auth-library');
    const client = new OAuth2Client(process.env.CLIENT_ID);

    async function verify() {
        try {
            const ticket = await client.verifyIdToken({
                idToken: token,
                audience: CLIENT_IDS  // Specify the CLIENT_ID of the app that accesses the backend
                // Or, if multiple clients access the backend:
                //[CLIENT_ID_1, CLIENT_ID_2, CLIENT_ID_3]
            });
            const payload = ticket.getPayload();
            console.log(ticket);
            console.log(payload);
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

            knex
                .select()
                .from('faculty')
                .where('email', email)
                .then(function (results) {
                    var rows = results.map((row) => { return row; });
                    if (rows.length == 1)
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
                    else if (accTypes.length == 0)
                    {
                        knex
                            .select()
                            .from('patients')
                            .where('email', email)
                            .then(function (resultsPat) {
                                var ids = resultsPat.map((row) => { return row.id; });
                                if (ids.length == 1)
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
        catch(e) {
            console.log('Auth: FAILURE');

            res.status(403)
                .set('Content-Type', 'text/plain')
                .send("BAD AUTH")
                .end();
        }
          // If request specified a G Suite domain:
          //const domain = payload['hd'];
    }
    verify();
}

module.exports.checkToken = checkToken;