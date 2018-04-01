const util = require('./util.js');

/** A list of all valid SQL fetching functions avalible on google app engine */
/**
*	This function processes the POST request and sends a POST to the SQL database to SELECT doctors from the appropriate table.
*	After retrieveing the data, knex will send a call back returning a HTTP 200 status code and the data requested.
* 	@param knex - connector between AppEngine and MySQL
*	@param req  - the POST request
*   @param res  - the POST response
**/
function fetchDoctors (knex, req, res)
{
    knex
        .select()
        .from('faculty')
        .where(function() {
            this.where('accType', 'doctor').orWhere('accType', 'adminDoctor')
        })
        .then(function (results) {
            var emails = results.map((row) => { return row.email; });
            util.respond(res, 200, JSON.stringify({emails: emails}));
        });
}

/**
*	This function processes the POST request and sends a POST to the SQL database to SELECT the id WHERE the email matches the specified email in the request body.
*	After retrieveing the data, knex will send a call back returning a HTTP 200 status code and the data requested.
* 	@param knex - connector between AppEngine and MySQL
*	@param req  - the POST request
*   @param res  - the POST response
**/
function fetchIDfromEmail (knex, req, res)
{
    knex
        .select()
        .from('patients')
        .where('email', req.body.email)
        .then(function (results) {
            var ids = results.map((row) => { return row.id; });
            if (ids.length == 1)
                util.respond(res, 200, JSON.stringify({id: ids[0]}));
            else
                util.respond(res, 400, JSON.stringify({err: 'Bad Fetch'}));
        });
}

/**
*	This function processes the POST request and sends a POST to the SQL database to SELECT patients WHERE the doctor column matches the one specified in the request body.
*	After retrieveing the data, knex will send a call back returning a HTTP 200 status code and the data requested.
* 	@param knex - connector between AppEngine and MySQL
*	@param req  - the POST request
*   @param res  - the POST response
**/
function fetchDoctorPatients (knex, email, res)
{
    knex
        .select()
        .from('patients')
        .where('doctorEmail', email)
        .then(function (results) {
            var ids = results.map((row) => { return row.id; });
            util.respond(res, 200, JSON.stringify(ids));
        });
}

/**
*	This function processes the POST request and sends a POST to the SQL database to SELECT readings WHERE the id matches the one specified in the request body.
*	After retrieveing the data, knex will send a call back returning a HTTP 200 status code and the data requested.
* 	@param knex - connector between AppEngine and MySQL
*	@param req  - the POST request
*   @param res  - the POST response
**/
function fetchReadings (knex, req, res)
{
    var data = req.body;

    knex
        .select()
        .from('patient_' + data.id)
        .then(function (results) {
            var csv = '';
            var cnt = 0;
            Array.prototype.forEach.call(results, function (row)
            {
                var rowParse = '';
                for (var key in row)
                {
                    if (key == 'timestamp')
                        rowParse += row[key];
                    else
                        rowParse += ',' + row[key];
                }
                cnt++;
                if (cnt != results.length)
                    rowParse += '\n';
                csv += rowParse;
            });
            util.respond(res, 200, csv);
        });
}


/**
*	This function processes the POST request and sends a POST to the SQL database to SELECT readings WHERE the id matches the one specified in the request body.
*	After retrieveing the data, knex will send a call back returning a HTTP 200 status code and the SIZE of the data requested.
* 	@param knex - connector between AppEngine and MySQL
*	@param req  - the POST request
*   @param res  - the POST response
**/
function fetchReadingsSize (knex, req, res, ids)
{
    var data = req.body;

    knex
        .select()
        .from('patient_' + data.id)
        .then(function (results) {
            var csv = '';
            var cnt = 0;
            Array.prototype.forEach.call(results, function (row)
            {
                var rowParse = '';
                for (var key in row)
                {
                    if (key == 'timestamp')
                        rowParse += row[key];
                    else
                        rowParse += ',' + row[key];
                }
                cnt++;
                if (cnt != results.length)
                    rowParse += '\n';
                csv += rowParse;
            });
            util.respond(res, 200, csv.length.toString());
        });
}

module.exports.fetchDoctors = fetchDoctors;
module.exports.fetchIDfromEmail = fetchIDfromEmail;
module.exports.fetchDoctorPatients = fetchDoctorPatients;
module.exports.fetchReadings = fetchReadings;
module.exports.fetchReadingsSize = fetchReadingsSize;