var process = require('process');
var express = require('express');
var Knex = require('knex');
const https = require('https');

var FetchRequestHandler = require('./FetchRequestHandler.js');
var InsertRequestHandler = require('./InsertRequestHandler.js');
var TokenHandler = require('./TokenHandler.js');
var AccountVerification = require('./AccountVerification.js');

var app = express();
var multer = require('multer');
var upload = multer();

var bodyParser = require('body-parser');
var jsonParser = bodyParser.json();
app.use(jsonParser);

app.enable('trust proxy');

var knex = Connect()

function Connect () //establish connection with database
{	
    var config = { //make sure your environment variables are set. This is for creating the proxy connection
        host: 8080,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: process.env.SQL_DATABASE
	};
    config.user = 'huhu';
    config.password = 'password';
    config.database = 'ecs193_database';
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

app.get('/', function (req, res, next) {
    res.status(404)
        .set('Content-Type', 'text/plain')
        .send(' ')
        .end();
});

//FETCHES
/**
*   This site takes a POST request and returns the list of doctors registered in the database.
*   example post body: none
**/
app.post('/fetch/doctors', function (req, res, next) {
    if (!req.is('application/json'))
        return next();

    tokenVerify(callback, res, req);
    function callback(authorization) //authorization is a JSON with accType and email
    {
        if(authorization.accType == 'doctor' || authorization.accType == 'adminDoctor' || authorization.accType == 'admin' ){
            FetchRequestHandler.fetchDoctors(knex, req, res);
        }
        else{
            noAuth401(res);
        }
    }
});


/**
*   This site takes a POST request and returns the id corresponding to the email given in the 'email' property
*   example post body: {email: johnsmith@gmail.com}
**/
app.post('/fetch/idFromEmail', function (req, res, next) {
    if (!req.is('application/json'))
        return next();

    tokenVerify(callback, res, req);
    function callback(authorization)
    {
        if(authorization.accType == 'doctor' || authorization.accType == 'adminDoctor' || authorization.accType == 'admin' ){
            FetchRequestHandler.fetchIDfromEmail(knex, req, res);
        }
        else{
            noAuth401(res);
        }
    }
});

/**
*   This site takes a POST request for the list of patients that are managed by the doctor specified in the 'doctor' property of the request body.
*   example post body: {doctor: doctorname}
**/
app.post('/fetch/doctorList', function (req, res, next) {
    if (!req.is('application/json'))
        return next();

    tokenVerify(callback, res, req);
    function callback(authorization)
    {
        if(authorization.accType == 'doctor' || authorization.accType == 'adminDoctor'  || authorization.accType == 'admin'){
            FetchRequestHandler.fetchDoctorPatients(knex, req, res);
        }
        else{
            noAuth401(res);
        }
    }
});

/**
*   This site takes a POST request for the readings for the id specified in the 'id' property of the request body.
*   example post body: {id: 1234}
**/
app.post('/fetch/readings', function (req, res, next) {
    if (!req.is('application/json'))
        return next();

    tokenVerify(callback, res, req);
    function callback(authorization)
    {
        if(authorization.accType == 'doctor' || authorization.accType == 'adminDoctor' )
        {
            //email
            knex("patients").select().where("id", req.body.id).then( (rows) =>{
                if( rows.length >= 1)
                {
                    if(rows[0].doctorEmail == authorization.email)
                    {
                        FetchRequestHandler.fetchReadings(knex, req, res);
                    }
                    else{
                        noAuth401(res)
                    }
                }
                else{
                    noAuth401(res)
                }
            });
        }
        else if (authorization.accType == 'patient')
        {
            knex("patients").select().where("id", req.body.id).then( (rows) =>{ 
                if( rows.length >= 1)
                {
                    if(rows[0].email == authorization.email)
                    {
                        FetchRequestHandler.fetchReadings(knex, req, res);
                    }
                    else{
                        noAuth401(res)
                    }
                }
                else{
                    noAuth401(res)
                }
            });
        }
        else{
            noAuth401(res);
        }
    }

});


//INSERTS

/**
 *  This site processes a post request and inserts patient reading information into the reading table.
 *  example post body: {id:1234, ch1: 1, ch2: 5, ch3: 6, ... , ch64:...}
 */
app.post('/insert/reading', jsonParser, function (req, res, next) {
    if(!req.is('application/json'))
        return next();
    tokenVerify(callback, res, req);
    function callback(authorization)
    {

        if(authorization.accType == 'patient')
        {
            knex("patients").select().where("id", req.body.id).then( (rows) =>{ 
                if( rows.length >= 1)
                {
                    if(rows[0].email == authorization.email)
                    {
                        InsertRequestHandler.insertReading(knex, req, res);
                    }
                    else{
                        noAuth401(res)
                    }
                }
                else{
                    noAuth401(res)
                }
            });
            //Email check
        }
        else{
            noAuth401(res);
        }
    }

    
});

/**
 *  This site processes a post request and inserts patient reading information into the reading table.
 *  example post body: {id:1234, ch1: 1, ch2: 5, ch3: 6, ... , ch64:...}
 *  This site will take in multipart/formdata instead of json formatted data.
 */
app.post('/insert/reading', upload.fields([]), function (req, res, next) {
    if(!req.is('multipart/form-data'))
        return next();
    tokenVerify(callback, res, req);
    function callback(authorization)
    {

        if(authorization.accType == 'patient')
        {
            knex("patients").select().where("id", req.body.id).then( (rows) =>{ 
                if( rows.length >= 1)
                {
                    if(rows[0].email == authorization.email)
                    {
                        InsertRequestHandler.insertReading(knex, req, res);
                    }
                    else{
                        noAuth401(res)
                    }
                }
                else{
                    noAuth401(res)
                }
            });
            //Email check
        }
        else{
            noAuth401(res);
        }
    }
});

/**
 * Standard 404 site
 */
app.post('/insert/reading', function (req, res, next) {''
    res.status(404)
        .set('Content-Type', 'text/plain')
        .send('You took a wrong turn somewhere.')
        .end();
});

//TOKENS

/**
 * Verifies Oauth2 token
 */
app.post('/check/token', jsonParser, function (req, res, next) {
    if(!req.is('application/json'))
        return next();
    TokenHandler.checkUserExists(knex, req, res);
});

//ACCOUNT

app.post('/token/sendEmail', jsonParser, function (req, res, next) {
    if (!req.is('application/json'))
        return next();
    AccountVerification.sendEmail(knex, req, res);
});

app.get('/validate', function (req, res, next) {
    AccountVerification.insertVerify(knex, req, res);
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

/**
 *  Verify Oauth2 Access tokens and allows access to SQL
 *  @param onSuccessCall a callback function (this is called regardless of whether the token is valid or not)
 *  @param serverRes Express.js res structure
 *  @param serverReq Express.js req structure (a token is expected in the req otherwise a 401 is returned)
 */
function tokenVerify(onSuccessCall, serverRes, serverReq)
{
    var accessToken = serverReq.body['accessToken'];
    if(accessToken == null)
        noAuth401(serverRes)

    var httpsOptions = {
        hostname: 'www.googleapis.com',
        port: 443,
        path: '/oauth2/v1/tokeninfo?access_token=' + accessToken,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    };
    var httpsReq = https.request(httpsOptions, fooCall);
    httpsReq.on('error', function(err) {
        console.log('problem with request: ' + err.message);
    });
    httpsReq.end();
    function notRegistered(res)
    {
        return res.status(401).set('Content-Type', 'text/plain')
        .send('You shall not pass.')
        .end();
    }
    function fooCall (res)
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
                        {
                            onSuccessCall({'accType': rows[0].accType, 'email': email});
                        }
                        else
                        {
                            knex
                                .select()
                                .from('patients')
                                .where('email', email)
                                .then(function (patRows) {
                                    if (rows.length > 0){
                                        onSuccessCall({'accType': 'patient', 'email': email});
                                    }
                                    else{
                                        notRegistered(serverRes);
                                    }
                                });
                        }
                    });
            }
            else{
                notRegistered(serverRes);
            }
        });
    }
}

/*
* Just sets server response to 401 Not authorized.
*/
function noAuth401(res)
{
    res.status(401).set('Content-Type', 'text/plain')
    .send('Not authorized.')
    .end();
}

module.exports = app;

