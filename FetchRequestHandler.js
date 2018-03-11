var process = require('process');
var express = require('express');
var Knex = require('knex');
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
            res.status(200)
                .set('Content-Type', 'text/plain')
                .send(JSON.stringify(emails))
                .end();
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
    var data = req.body;

    knex
        .select()
        .from('patients')
        .where('email', data.email)
        .then(function (results) {
            var ids = results.map((row) => { return row.id; });
            if (ids.length == 1)
            {
                res.status(200)
                    .set('Content-Type', 'text/plain')
                    .send(ids[0].toString())
                    .end();
            }
        });
}

/**
*	This function processes the POST request and sends a POST to the SQL database to SELECT patients WHERE the doctor column matches the one specified in the request body.
*	After retrieveing the data, knex will send a call back returning a HTTP 200 status code and the data requested.
* 	@param knex - connector between AppEngine and MySQL
*	@param req  - the POST request
*   @param res  - the POST response
**/
function fetchDoctorPatients (knex, req, res)
{
    var data = req.body;

    knex
        .select()
        .from('patients')
        .where('doctorEmail', data.doctor)
        .then(function (results) {
            var ids = results.map((row) => { return row.id; });
            res.status(200)
                .set('Content-Type', 'text/plain')
                .send(JSON.stringify(ids))
                .end();
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
            res.status(200)
                .set('Content-Type', 'text/plain')
                .send(csv)
                .end();
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
            res.status(200)
                .set('Content-Type', 'text/plain')
                .send(csv.length.toString())
                .end();
        });
}

module.exports.fetchDoctors = fetchDoctors;
module.exports.fetchIDfromEmail = fetchIDfromEmail;
module.exports.fetchDoctorPatients = fetchDoctorPatients;
module.exports.fetchReadings = fetchReadings;
module.exports.fetchReadingsSize = fetchReadingsSize;