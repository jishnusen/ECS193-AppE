//macro to respond using the express.js res object
function respond (res, status, message)
{
    res.status(status)
        .set('Content-Type', 'text/plain')
        .send(message)
        .end();
}
module.exports.respond = respond;

//checks if obj has all of the properites inside of the array props
function checkProperties (props, obj)
{
    for (var i = 0; i < props.length; i++)
        if (!obj.hasOwnProperty(props[i]))
            return false;
    return true;
}
module.exports.checkProperties = checkProperties;