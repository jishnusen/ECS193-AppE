var process = require('process');
var express = require('express');
var Knex = require('knex');

/** A List of all avalible data inserting functions for the MySQL database that are avalible on the AppEngine */
/**
*	This function processes the POST request and sends a POST to the SQL database to INSERT patients to the appropriate table as well as generating a unique table for said patient.
*	After sending the data, knex will send a call back returning a HTTP 200 status coded.
* 	@param knex - connector between AppEngine and MySQL
*	@param req  - the POST request
*   @param res  - the POST response
**/
function insertPatient (knex, data, res)
{
	knex('faculty')
		.where('email', data.doctorEmail)
		.catch((err) => console.log(err))
		.then(function(rows) {
			if (rows.length > 0)
			{
				if (rows[0].accType != 'doctor' && rows[0].accType != 'adminDoctor')
				{
					res.status(400)
						.set('Content-Type', 'text/plain')
						.send('Doctor does not exist.')
						.end();
					return;
				}

				knex('patients')
					.insert(data)
					.catch((err) => { console.log(err); })
					.then(function() {
						knex('patients')
							.orderBy('id', 'desc')
							.limit(1)
							.then(function(rows) {
								var row = rows[0];
								var id = row.id;
								var tableName = 'patient_' + id;
								knex.schema.
									createTable(tableName, function(table) {
										table.dateTime('timestamp').defaultTo(knex.fn.now()).primary();
										for (var i = 0; i < 64; i++)
											table.float('ch' + i).notNullable();
									})
									.then(function() {
										res.status(200)
											.set('Content-Type', 'text/plain')
											.send('Received: ' + JSON.stringify(data))
											.end();
									});
							});
					});
			}
			else
			{
				res.status(400)
					.set('Content-Type', 'text/plain')
					.send('Doctor does not exist.')
					.end();
			}
		});
}


/**
*	This function processes the POST request and sends a POST to the SQL database to INSERT doctors to the appropriate table
*	After sending the data, knex will send a call back returning a HTTP 200 status coded.
* 	@param knex - connector between AppEngine and MySQL
*	@param req  - the POST request
*   @param res  - the POST response
**/
function insertFaculty (knex, data, res)
{
	knex('faculty')
		.where('email', data.email)
		.catch((err) => { console.log(err); })
		.then(function(rows) {
			if (rows.length >= 1)
			{
				res.status(400)
					.set('Content-Type', 'text/plain')
					.send('Faculty of same name already exists.')
					.end();
			}
			else
			{
				knex('faculty')
					.insert(data)
					.catch((err) => { console.log(err); })
					.then(function() {
						res.status(200)
							.set('Content-Type', 'text/plain')
							.send('Received: ' + JSON.stringify(data))
							.end();
					});
			}
		});
}

/**
*	This function processes the POST request and sends a POST to the SQL database to INSERT readings to the appropriate table
*	After sending the data, knex will send a call back returning a HTTP 200 status coded.
* 	@param knex - connector between AppEngine and MySQL
*	@param req  - the POST request
*   @param res  - the POST response
**/
function insertReading (knex, req, res)
{
	var body = req.body;
	var resmsg = '';
	var errmsg = '';
	var success = true;
	var msg = '';
	var table_name = '';
	
	for (var key in body) // Process the request body collecting all properties, if the property is a JSON object it will be parsed as a JSON object before being stored.
	{
		table_name = key; 
		if(Array.isArray(body[key]))
			values = body[key].map(x => JSON.parse(x));
		else
			try 
			{
				values = JSON.parse(body[key]);
			}
			catch(e) 
			{
				values = body[key];
			}
			break;
	}

	temp = knex(table_name).insert(values); //creates the knex insert request
	knex.schema.hasTable(table_name).then(function (exists) { //checks if the patient table exists
		if(exists)
		{
				temp.then (function (result) { //sends the knex insert request to MySQL
					res.status(200)
						.set('Content-Type', 'text/plain')
						.send("All insertions were success.")
						.end();
				})
				.catch(function (err) {
					errmsg += err;				
					res.status(400)
						.set('Content-Type', 'text/plain')
						.send("The following commands had errors: " + errmsg)
						.end();
				});
		}
		else
		{
			errmsg += "Table: " + table_name + " does not exist.\n";
			res.status(400)
				.set('Content-Type', 'text/plain')
				.send("The following commands had errors: " + errmsg)
				.end();
		}
	});
}

module.exports.insertPatient = insertPatient;
module.exports.insertFaculty = insertFaculty;
module.exports.insertReading = insertReading;