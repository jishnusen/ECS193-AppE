const process = require('process');
const express = require('express');
const Knex = require('knex');
const util = require('./util.js');

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
	//console.log('insertPatient');
	knex('faculty')
		.where('email', data.doctorEmail)
		.catch((err) => console.log(err))
		.then(function(rows) {
			if (rows.length > 0)
			{
				if (rows[0].accType != 'doctor' && rows[0].accType != 'adminDoctor')
				{
					util.respond(res, 400, 'Doctor does not exist.');
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
										table.string('event').notNullable();
										table.float('amount');
										for (var i = 0; i < 64; i++)
											table.float('ch' + i);
									})
									.then(function() {
										util.respond(res, 200, 'Received: ' + JSON.stringify(data));
									});
							});
					});
			}
			else
			{
				util.respond(res, 400, 'Doctor does not exist.');
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
				util.respond(res, 400, 'Faculty of same name already exists.');
			else
			{
				knex('faculty')
					.insert(data)
					.catch((err) => { console.log(err); })
					.then(function() {
						util.respond(res, 200, 'Received: ' + JSON.stringify(data));

						if (data.accType == 'doctor' || data.accType == 'adminDoctor')
						{
							knex('faculty')
								.orderBy('id', 'desc')
								.limit(1)
								.then(function(rows) {
									var id = rows[0].id;
									newTableName = 'doctorNotes_' + id;
									knex.schema.createTable(newTableName, (table) => {
										table.increments('id').primary();
										table.dateTime('timestamp').defaultTo(knex.fn.now());
										table.string('type').notNullable();
										table.integer('patientID').notNullable();
										table.string('note');
									}).then(() => {});
								});
						}
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
	var id = req.body.id;
	var table = 'patient_' + id;
	var readings = req.body.readings;
	var badFlag = false;
	var insertCount = 0;

	for (var i = 0; i < readings.length; i++)
	{
		var hasProps = util.checkProperties(['timestamp', 'channels'], readings[i]);
		if (!hasProps)
		{
			util.respond(res, 400, JSON.stringify({err: 'Bad Request'}));
			return;
		}
		if (readings[i].channels.length != 64)
		{
			util.respond(res, 400, JSON.stringify({err: 'Bad Request'}));
			return;
		}
	}

	for (var i = 0; i < readings.length; i++)
	{
		var insertStr = '{"timestamp":"' + readings[i].timestamp + '",';
		insertStr += '"event":"reading","amount":0,';
		for (var j = 0; j < 63; j++)
			insertStr += '"ch' + j + '":"' + readings[i].channels[j] + '",';
		insertStr += '"ch63":"' + readings[i].channels[63] + '"}';
		var insertObj = JSON.parse(insertStr);

		knex(table)
			.insert(insertObj)
			.then((result) => {
				insertCount++;
				if (insertCount == readings.length)
					util.respond(res, 200, JSON.stringify({body: 'Successful Insert'}));
			})
			.catch((err) => {
				errored();
			});
	}

	function errored () 
	{
		if (!badFlag)
			util.respond(res, 400, JSON.stringify({err: 'Bad Insert'}));
		badFlag = true;
	}
}

function insertNote (knex, req, res)
{
	var data = {
		patientID: req.body.patientID,
		type: 'note',
		note: req.body.note
	};
	var table = 'doctorNotes_' + req.body.id;

	knex(table)
		.insert(data)
		.then(() => {
			util.respond(res, 200, JSON.stringify({body: 'Insert Successful'}));
		});
}

function insertUpdateTag (knex, req, res)
{
	var table = 'doctorNotes_' + req.body.id;
	var patientID = req.body.patientID;
	var newTag = req.body.tag;

	knex(table)
		.select()
		.where({
			'type': 'tag',
			'patientID': patientID
		})
		.then((rows) => {
			if (rows.length > 0)
			{
				knex(table)
					.where({
						'type': 'tag',
						'patientID': patientID
					})
					.update('note', newTag)
					.then(() => {
						util.respond(res, 200, JSON.stringify({body: 'Update Successful'}));
					});
			}
			else
			{
				var data = {
					type: 'tag',
					patientID: patientID,
					note: newTag
				};
				knex(table)
					.insert(data)
					.then(() => {
						util.respond(res, 200, JSON.stringify({body: 'Insert Successful'}));
					});
			}
		});
}

module.exports.insertPatient = insertPatient;
module.exports.insertFaculty = insertFaculty;
module.exports.insertReading = insertReading;
module.exports.insertNote = insertNote;
module.exports.insertUpdateTag = insertUpdateTag;