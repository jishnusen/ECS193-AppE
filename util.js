function respond (res, status, message)
{
    res.status(status)
        .set('Content-Type', 'text/plain')
        .send(message)
        .end();
}
module.exports.respond = respond;

function checkProperties (props, obj)
{
    for (var i = 0; i < props.length; i++)
        if (!obj.hasOwnProperty(props[i]))
            return false;
    return true;
}
module.exports.checkProperties = checkProperties;