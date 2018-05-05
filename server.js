const process = require('process');
const express = require('express');
const Knex = require('knex');
const https = require('https');

const util = require('./util.js');
const FetchRequestHandler = require('./FetchRequestHandler.js');
const InsertRequestHandler = require('./InsertRequestHandler.js');
const Authenticator = require('./Authenticator.js');
const AccountHandler = require('./AccountHandler.js');

const app = express();
const multer = require('multer');
const upload = multer();

const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();
app.use(jsonParser);

app.enable('trust proxy');

var knex = Connect()

function Connect () //establish connection with database
{	
    var config = { //make sure your environment variables are set. This is for creating the proxy connection
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: process.env.SQL_DATABASE
    };
    
     if (process.env.INSTANCE_CONNECTION_NAME && process.env.NODE_ENV === 'production') 
        config.socketPath = `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`; //sets path to databse
    
    if (process.env.NODE_ENV != 'production') { // This is for when the program is deployed onto GoogleApp engine
        config.host = '35.199.174.8'; 
        config.user = 'huhu';
        config.password = 'password';
        config.database = 'ecs193_database';
    }

    var knex = Knex({ //setting knex config properties
        client: 'mysql',
        connection: config
    }); 
	
    return knex;
}

//FETCHES
/**
*   This site takes a POST request and returns the list of doctors registered in the database.
*   example post body: none
**/
app.post('/fetch/doctors', function (req, res, next) {
    if (!req.is('application/json'))
        return next();

    var hasProps = util.checkProperties(['authCode'], req.body);
    if (!hasProps)
        util.respond(res, 401, JSON.stringify({err: 'Bad Request'}));
    else
        Authenticator.getRequestor(knex, req, gotRequestor);

    function gotRequestor (requestor)
    {
        if (requestor.hasOwnProperty('err'))
        {
            util.respond(res, 401, JSON.stringify({err: 'Bad Auth'}));
            return;
        }

        if (requestor.accType != 'patient')
            FetchRequestHandler.fetchDoctors(knex, req, res);
        else
            util.respond(res, 401, JSON.stringify({err: 'Bad Credentials'}));
    }
});

app.post('/fetch/patientMeta', function (req, res, next) {
    if (!req.is('application/json'))
        return next();
    
    var hasProps = util.checkProperties(['authCode'], req.body);
    if (!hasProps)
        util.respond(res, 401, JSON.stringify({err: 'Bad Request'}));
    else
        Authenticator.getRequestor(knex, req, gotRequestor);

    function gotRequestor (requestor)
    {
        if (requestor.hasOwnProperty('err'))
        {
            util.respond(res, 401, JSON.stringify({err: 'Bad Auth'}));
            return;
        }

        if (requestor.accType == 'admin' || requestor.accType == 'adminDoctor')
            FetchRequestHandler.fetchPatientMetaData(knex, req, res);
        else
            util.respond(res, 401, JSON.stringify({err: 'Bad Credentials'}));
    }
});


/**
*   This site takes a POST request and returns the id corresponding to the email given in the 'email' property
*   example post body: {email: johnsmith@gmail.com}
**/
app.post('/fetch/idFromEmail', function (req, res, next) {
    if (!req.is('application/json'))
        return next();

    var hasProps = util.checkProperties(['authCode'], req.body);
    if (!hasProps)
        util.respond(res, 401, JSON.stringify({err: 'Bad Request'}));
    else
        Authenticator.getRequestor(knex, req, gotRequestor);

    function gotRequestor (requestor)
    {
        if (requestor.hasOwnProperty('err'))
        {
            util.respond(res, 401, JSON.stringify({err: 'Bad Auth'}));
            return;
        }

        if (requestor.accType != 'patient')
            FetchRequestHandler.fetchIDfromEmail(knex, req, res);
        else
            util.respond(res, 401, JSON.stringify({err: 'Bad Credentials'}));
    }
});

/**
*   This site takes a POST request for the list of patients that are managed by the doctor specified in the 'doctor' property of the request body.
*   example post body: {doctor: doctorname}
**/
app.post('/fetch/doctorList', function (req, res, next) {
    if (!req.is('application/json'))
        return next();

    var hasProps = util.checkProperties(['authCode'], req.body);    
    if (!hasProps)
        util.respond(res, 401, JSON.stringify({err: 'Bad Request'}));
    else
        Authenticator.getRequestor(knex, req, gotRequestor);

    function gotRequestor (requestor)
    {
        if (requestor.hasOwnProperty('err'))
        {
            util.respond(res, 401, JSON.stringify({err: 'Bad Auth'}));
            return;
        }

        if (requestor.accType != 'patient')
            FetchRequestHandler.fetchDoctorPatients(knex, requestor.email, res);
        else
            util.respond(res, 401, JSON.stringify({err: 'Bad Credentials'}));
    }
});

/**
*   This site takes a POST request for the readings for the id specified in the 'id' property of the request body.
*   example post body: {id: 1234}
**/
app.post('/fetch/readings', function (req, res, next) {
    if (!req.is('application/json'))
        return next();

    var hasProps = util.checkProperties(['authCode', 'id'], req.body);
    if (!hasProps)
        util.respond(res, 401, JSON.stringify({err: 'Bad Request'}));
    else
        Authenticator.getRequestor(knex, req, gotRequestor);

    function gotRequestor (requestor)
    {
        if (requestor.hasOwnProperty('err'))
        {
            util.respond(res, 401, JSON.stringify({err: 'Bad Auth'}));
            return;
        }

        if (requestor.accType == 'admin')
        {
            util.respond(res, 401, JSON.stringify({err: 'Bad Credentials'}));
            return;
        }

        knex('patients')
            .select()
            .where('id', req.body.id)
            .then((rows) => {
                if (rows.length == 1)
                {
                    if (requestor.accType != 'patient')
                    {
                        if (rows[0].doctorEmail == requestor.email)
                            FetchRequestHandler.fetchReadings(knex, req, res);
                        else
                            util.respond(res, 401, JSON.stringify({err: 'Bad Credentials'}));
                    }
                    else
                    {
                        if (rows[0].email == requestor.email)
                            FetchRequestHandler.fetchReadings(knex, req, res);
                        else
                            util.respond(res, 401, JSON.stringify({err: 'Bad Credentials'}));
                    }
                }
                else
                    util.respond(res, 400, JSON.stringify({err: 'Bad ID'}));
            });
    }
});

/**
*   This site takes a POST request for the readings for the id specified in the 'id' property of the request body.
*   example post body: {id: 1234}
**/
app.post('/mobile/readings', function (req, res, next) {
    if (!req.is('application/json'))
        return next();

    var hasProps = util.checkProperties(['authCode', 'id'], req.body);
    if (!hasProps)
        util.respond(res, 401, JSON.stringify({err: 'Bad Request'}));
    else
        Authenticator.getRequestor(knex, req, gotRequestor);

    function gotRequestor (requestor)
    {
        if (requestor.hasOwnProperty('err'))
        {
            util.respond(res, 401, JSON.stringify({err: 'Bad Auth'}));
            return;
        }

        if (requestor.accType == 'admin')
        {
            util.respond(res, 401, JSON.stringify({err: 'Bad Credentials'}));
            return;
        }

        knex('patients')
            .select()
            .where('id', req.body.id)
            .then((rows) => {
                if (rows.length == 1)
                {
                    if (requestor.accType != 'patient')
                    {
                        if (rows[0].doctorEmail == requestor.email)
                            FetchRequestHandler.fetchReadingsLimited(knex, req, res);
                        else
                            util.respond(res, 401, JSON.stringify({err: 'Bad Credentials'}));
                    }
                }
                else
                    util.respond(res, 400, JSON.stringify({err: 'Bad ID'}));
            });
    }
});


//INSERTS

/**
 *  This site processes a post request and inserts patient reading information into the reading table.
 *  example post body:
 * {
 *   authCode: ****,
 *   id: 0,
 *   readings: [
 *     {timestamp: ****, channels: [0, 1, 2, 3, 4, ..., 63]},
 *     {...}
 *   ]
 * }
 */
app.post('/insert/reading', function (req, res, next) {
    if(!req.is('application/json'))
        return next();
    
    var hasProps = util.checkProperties(['authCode', 'id', 'readings'], req.body);
    if (!hasProps)
        util.respond(res, 401, JSON.stringify({err: 'Bad Request'}));
    else
        Authenticator.getRequestor(knex, req, gotRequestor);

    function gotRequestor (requestor)
    {
        if (requestor.hasOwnProperty('err'))
        {
            util.respond(res, 401, JSON.stringify({err: 'Bad Auth'}));
            return;
        }

        if (requestor.accType != 'patient')
        {
            util.respond(res, 401, JSON.stringify({err: 'Bad Credentials'}));
            return;
        }

        knex('patients')
            .select()
            .where('id', req.body.id)
            .then((rows) => {
                if (rows.length == 1)
                {
                    if (rows[0].email == requestor.email)
                        InsertRequestHandler.insertReading(knex, req, res);
                    else
                        util.respond(res, 401, JSON.stringify({err: 'Bad Credentials'}));
                }
                else
                    util.respond(res, 400, JSON.stringify({err: 'Bad ID'}));
            });
    } 
});

/**
 *  This site processes a post request and changes doctor for patient in databse.
 *  example post body:
 * {
 *   authCode: ****,
 *   id: 0,
 *   doctor email: **** 
 *   
 * }
 */
app.post('/transfer/patient', function (req, res, next) {
    if(!req.is('application/json'))
        return next();
    
    var hasProps = util.checkProperties(['authCode', 'id', 'destination'], req.body);
    if (!hasProps)
        util.respond(res, 401, JSON.stringify({err: 'Bad Request'}));
    else
        Authenticator.getRequestor(knex, req, gotRequestor);

    function gotRequestor (requestor)
    {
        if (requestor.hasOwnProperty('err'))
        {
            util.respond(res, 401, JSON.stringify({err: 'Bad Auth'}));
            return;
        }

        if (requestor.accType == 'admin' || requestor.accType == 'adminDoctor')
        {
            knex('patients')
                .select()
                .where('id', req.body.id)
                .update('doctorEmail', req.body.destination)
                .then(() => {
                    util.respond(res, 401, JSON.stringify({body: 'Transfer Successful'}));
                });
        }
        else{
            util.respond(res, 401, JSON.stringify({err: 'Bad Credentials'}));
            return;
        }


    } 
});

app.post('/remove/patient', function (req, res, next) {
    if (!req.is('application/json'))
        return next();
    
    var hasProps = util.checkProperties(['authCode', 'id'], req.body);
    if (!hasProps)
        util.respond(res, 401, JSON.stringify({err: 'Bad Request'}));
    else
        Authenticator.getRequestor(knex, req, gotRequestor);
    
    function gotRequestor (requestor)
    {
        if (requestor.hasOwnProperty('err'))
        {
            util.respond(res, 401, JSON.stringify({err: 'Bad Auth'}));
            return;
        }

        if (requestor.accType == 'admin' || requestor.accType == 'adminDoctor')
        {
            knex('patients')
                .select()
                .where('id', req.body.id)
                .then((rows) => {
                    if (rows.length > 0)
                    {
                        var pat = rows[0];
                        if (pat.doctorEmail == '')
                        {
                            knex('patients')
                                .where('id', req.body.id)
                                .del()
                                .then(() => {});
                            knex.schema
                                .dropTableIfExists('patient_' + req.body.id)
                                .then(() => {});
                            util.respond(res, 200, JSON.stringify({body: 'Remove Success'}));
                        }
                        else
                            util.respond(res, 400, JSON.stringify({err: 'Cannot remove assigned patient. Unassign then try again.'}));
                    }
                    else
                        util.respond(res, 400, JSON.stringify({err: 'Bad id'}));
                });
        }
        else{
            util.respond(res, 401, JSON.stringify({err: 'Bad Credentials'}));
            return;
        }
    }
});

app.post('/remove/doctor', function (req, res, next) {
    if (!req.is('application/json'))
        return next();
    
    var hasProps = util.checkProperties(['authCode', 'email'], req.body);
    if (!hasProps)
        util.respond(res, 401, JSON.stringify({err: 'Bad Request'}));
    else
        Authenticator.getRequestor(knex, req, gotRequestor);
    
    function gotRequestor (requestor)
    {
        if (requestor.hasOwnProperty('err'))
        {
            util.respond(res, 401, JSON.stringify({err: 'Bad Auth'}));
            return;
        }

        if (requestor.accType == 'admin' || requestor.accType == 'adminDoctor')
        {
            knex('faculty')
                .select()
                .where('email', req.body.email)
                .andWhere(() => {
                    this.where('accType', 'doctor').orWhere('accType', 'adminDoctor');
                })
                .then((rows) => {
                    if (rows.length > 0)
                    {
                        if (rows[0].accType == 'doctor')
                        {
                            knex('faculty')
                                .where('email', req.body.email)
                                .del()
                                .then(() => {});
                        }
                        else if (rows[0].accType == 'adminDoctor')
                        {
                            knex('faculty')
                                .where('email', req.body.email)
                                .update({
                                    accType: 'admin',
                                    digest: 'null',
                                    expire: false
                                })
                                .then(() => {});
                        }
                        util.respond(res, 200, JSON.stringify({body: 'Remove Success'}));
                    }
                    else
                        util.respond(res, 400, JSON.stringify({err: 'Bad email'}));
                });
        }
        else{
            util.respond(res, 401, JSON.stringify({err: 'Bad Credentials'}));
            return;
        }
    }
});

app.post('/remove/admin', function (req, res, next) {
    if (!req.is('application/json'))
        return next();
    
    var hasProps = util.checkProperties(['authCode', 'email'], req.body);
    if (!hasProps)
        util.respond(res, 401, JSON.stringify({err: 'Bad Request'}));
    else
        Authenticator.getRequestor(knex, req, gotRequestor);
    
    function gotRequestor (requestor)
    {
        if (requestor.hasOwnProperty('err'))
        {
            util.respond(res, 401, JSON.stringify({err: 'Bad Auth'}));
            return;
        }

        if (requestor.accType == 'admin' || requestor.accType == 'adminDoctor')
        {
            knex('faculty')
                .select()
                .where('email', req.body.email)
                .andWhere(() => {
                    this.where('accType', 'admin').orWhere('accType', 'adminDoctor');
                })
                .then((rows) => {
                    if (rows.length > 0)
                    {
                        if (rows[0].accType == 'admin')
                        {
                            knex('faculty')
                                .where('email', req.body.email)
                                .del()
                                .then(() => {});
                        }
                        else if (rows[0].accType == 'adminDoctor')
                        {
                            knex('faculty')
                                .where('email', req.body.email)
                                .update({
                                    accType: 'doctor',
                                    digest: 'null',
                                    expire: false
                                })
                                .then(() => {});
                        }
                        util.respond(res, 200, JSON.stringify({body: 'Remove Success'}));
                    }
                    else
                        util.respond(res, 400, JSON.stringify({err: 'Bad email'}));
                });
        }
        else{
            util.respond(res, 401, JSON.stringify({err: 'Bad Credentials'}));
            return;
        }
    }
});

//ACCOUNT

app.post('/account/sendEmail', jsonParser, function (req, res, next) {
    if (!req.is('application/json'))
        return next();
    var hasProps = util.checkProperties(['authCode', 'newAccType', 'recipientEmail', 'recipientFamilyName', 'recipientGivenName'], req.body);
    if (!hasProps)
        util.respond(res, 401, JSON.stringify({err: 'Bad Request'}));
    else
        AccountHandler.sendEmail(knex, req, res);
});

app.get('/account/validate', function (req, res, next) {
    AccountHandler.insertVerify(knex, req, res);
});

//AUTHENTICATION

app.post('/security/getAuth', function (req, res, next) {
    if (!req.is('application/json'))
        return next();
    var hasProps = util.checkProperties(['accessToken'], req.body);
    if (!hasProps)
        util.respond(res, 401, JSON.stringify({err: 'Bad Request'}));
    else
        Authenticator.getAuthForToken(knex, req, res);
});

app.post('/security/revokeAuth', function (req, res, next) {
    if (!req.is('application.json'))
        return next();
    var hasProps = util.checkProperties(['email', 'authCode', 'accType'], req.body);
    if (!hasProps)
        util.respond(res, 401, JSON.stringify({err: 'Bad Request'}));
    else
        Authenticator.revokeAuthentication(knex, req, res);
});

/**
 * Just debug stuff for localhost appengine. (though this will display on the console too)
 */
const PORT = process.env.PORT || 8080;
app.listen(PORT, function ()
{
    console.log(`App listening on port ${PORT}`);
    console.log('Press Ctrl+C to quit.');
});

//UNUSED
/**
 *  Verify Oauth2 Access tokens and allows access to SQL
 *  @param onSuccessCall a callback function (this is called regardless of whether the token is valid or not)
 *  @param serverRes Express.js res structure
 *  @param serverReq Express.js req structure (a token is expected in the req otherwise a 401 is returned)
 */
function tokenVerify (onSuccessCall, serverRes, serverReq)
{
    var accessToken = serverReq.body['accessToken'];
    if(accessToken == null)
        util.respond(serverRes, 401, 'No Access');

    var httpsOptions = {
        hostname: 'www.googleapis.com',
        port: 443,
        path: '/oauth2/v1/tokeninfo?access_token=' + accessToken,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    };
    var httpsReq = https.request(httpsOptions, tokenCB);
    httpsReq.on('error', function(err) {
        console.log('problem with request: ' + err.message);
    });
    httpsReq.end();

    function tokenCB (res)
    {
        res.on('data', function (cbBody) { //returns json object with accType and email, or 401 if invalid token
            var retObj = JSON.parse(cbBody);
            if (retObj.hasOwnProperty('email'))
            {
                var email = retObj.email;
                knex
                    .select()
                    .from('faculty')
                    .where('email', email)
                    .then(function (rows) {
                        if (rows.length > 0)
                            onSuccessCall({ accType: rows[0].accType, email: email });
                        else
                        {
                            knex
                                .select()
                                .from('patients')
                                .where('email', email)
                                .then(function (patRows) {
                                    if (patRows.length > 0)
                                        onSuccessCall({ accType: 'patient', email: email });
                                    else
                                        util.respond(serverRes, 401, 'No Access');
                                });
                        }
                    });
            }
            else
                util.respond(serverRes, 401, 'No Access');
        });
    }
}

module.exports = app;