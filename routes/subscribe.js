/**
 * POST a new subscription.
 */

var http = require('http');
var https = require('https');
var querystring = require('querystring');
var url = require('url');
var uuid = require('node-uuid');

exports.subscribe = function(req, res, subscribeEvents) {
  console.log('Incoming request.');
  if (req.form) {
    req.form.complete(function(err, fields, files) {
      respond(fields, res, subscribeEvents);
    });
  }
  else {
    respond(params.body, res, subscribeEvents);
  }
};

/**
 * Handles the actual response to a subscription request.
 *
 * @param {object} fields
 *   The POST fields we consumed.
 * @param {object} res
 *   The response object.
 * @param {EventEmitter} subscribeEvents
 *   An event emitter to notify the factory of events.
 */
function respond(fields, res, subscribeEvents) {
  // Ensure the required fields exist.
  var valid = true;
  var message = 'Invalid request';
  if (typeof fields['hub.callback'] === 'undefined') {
    valid = false;
  }
  else if (typeof fields['hub.mode'] === 'undefined') {
    valid = false;
  }
  else if (typeof fields['hub.topic'] === 'undefined') {
    valid = false;
  }
  else if (typeof fields['hub.verify'] === 'undefined') {
    valid = false;
  }

  if (!valid) {
    res.send(message, 500);
    return;
  }

  if (fields['hub.verify'] === 'async') {
    // Respond that we got it.
    res.send('Accepted', 202);
  }

  // Verify intent.
  var query = {
    'hub_mode': fields['hub.mode'],
    'hub_topic': fields['hub.topic'],
    'hub_challenge': uuid.v4(),
  };
  if (typeof fields['hub.lease_seconds'] !== 'undefined') {
    query['hub_lease_seconds'] = fields['hub.lease_seconds'];
  }
  if (typeof fields['hub.verify_token'] !== 'undefined') {
    query['hub_verify_token'] = fields['hub.verify_token'];
  }
  var options = url.parse(fields['hub.callback'] + '?' + querystring.stringify(query));

  var re = /^https.+/
  var method = http;
  if (re.test(options.protocol)) {
    method = https;
  }
  method.get(options, function onReq(verifyRes) {
    console.log('Verifying intent.');
    var data = '';
    verifyRes.on('data', function onData(chunk) {
      data += chunk;
    });

    verifyRes.on('end', function onEnd() {
      if (verifyRes.statusCode < 200 || verifyRes.statusCode > 299) {
        console.error('Unable to verify, server responded with %d', verifyRes.statusCode);
        res.send('Unable to verify, server responded with ' + verifyRes.statusCode, 401);
        return;
      }
      if (data != query['hub_challenge']) {
        console.error('Unable to verify, %s does not match %s', data, query['hub_challenge']);
        res.send('Unable to verify, server responded with ' + verifyRes.statusCode, 401);
        return;
      }
      else {
        // Save the subscriptions.
        console.log(
          'Verified new subscription to %s for %s',
          fields['hub.topic'],
          fields['hub.callback']
        );

        if (fields['hub.verify'] === 'sync') {
          res.send('', 204);
        }
        else {
          // TODO - respond async.
        }

        // Explicitly set the callback before we save the data locally.
        query.hub_callback = fields['hub.callback'];

        // Notify the factory that we have an incoming subscription.
        subscribeEvents.emit('subscribed', query);
      }
    });
  });
};
