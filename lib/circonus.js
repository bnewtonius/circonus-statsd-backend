/*
 * Copyright (c) 2010 Etsy
 * Copyright (c) 2012 Zimride
 * Copyright (c) 2013 Lyft
 *
 * Flush stats to circonus (based on the graphite backend).
 *
 * To enable this backend, include 'circonus' in the backends
 * configuration array:
 *
 *   backends: ['circonus-statsd-backend']
 *
 * This backend supports the following config options:
 *   trapUrl: url to submit data to
 */

var
  https = require('https'),
  util = require('util'),
  fs = require('fs'),
  url_parse = require('url').parse;

var debug;
var flushInterval;
var trapUrl;
var CACert;

var circonusStats = {};

// Statsd counters reset, we want monotonically increasing counters.
var circonusCounters = {};

/**
 * Post stats to the Circonus HTTPTrap URL
 * @param  {Object} payload Flat JSON to send to Circonus
 */
var post_stats = function circonus_post_stats(payload) {
  if (trapUrl) {
    try {
      payload = JSON.stringify(payload);
      var parsed_host = url_parse(trapUrl);
      if (debug) {
        util.log('Parsed circonus host: ' + JSON.stringify(parsed_host));
      }
      var options = {
        host: parsed_host["hostname"],
        port: parsed_host["port"] || 443,
        path: parsed_host["pathname"],
        method: 'PUT',
        ca: [ fs.readFileSync(CACert) ],

        headers: {
          "Content-Type": "application/json",
          "User-Agent" : "StatsdCirconusBackend/1",
          "Content-Length": payload.length
        }
      };

      var req = https.request(options, function(res) {
        if (debug) {
          util.log('Circonus response status: ' + res.statusCode);
          util.log('Circonus response headers: ' + JSON.stringify(res.headers));
          res.setEncoding('utf8');
          res.on('data', function (chunk) {
            util.log('Circonus response body: ' + chunk);
          });
        }
      });
      req.on('error', function(e) {
        util.log('Error making circonus request: ' + e.message);
      });
      if (debug) {
        util.log('Circonus request body: ' + payload);
      }
      req.write(payload);
      req.end();
      circonusStats.last_flush = Math.round(new Date().getTime() / 1000);
    } catch(e){
      if (debug) {
        util.log('Exception sending stats to circonus: ' + e);
      }
      circonusStats.last_exception = Math.round(new Date().getTime() / 1000);
    }
  }
};

/**
 * Flush event handler. Collects and flattens statsd data to send to circonus
 * and then calls post_stats(stats) to send the data to circonus via https.
 * @param  {Date}   ts      Timestamp
 * @param  {Object} metrics Metrics collected by statsd during this interval
 */
var flush_stats = function circonus_flush(ts, metrics) {
  var
    start = Date.now(),
    stats = {},
    numStats = 0;

  stats = flattenJson(metrics);

  stats['statsd.numStats'] = Object.keys(stats).length;
  stats['statsd.circonusStats.calculationTime'] = + (Date.now() - start);
  stats['statsd.flushInterval'] = flushInterval;

  post_stats(stats);
};

var backend_status = function circonus_status(writeCb) {
  for (var stat in circonusStats) {
    writeCb(null, 'circonus', stat, circonusStats[stat]);
  }
};

exports.init = function circonus_init(startup_time, config, events) {
  var backend_config = config.circonus || {};

  debug     = backend_config.debug || config.debug || false;
  trapUrl   = backend_config.trapUrl;
  CACert    = backend_config.CACert || '/usr/local/share/ca-certificates/circonus_CA.crt';

  circonusStats.last_flush     = startup_time;
  circonusStats.last_exception = startup_time;

  flushInterval = config.flushInterval;

  events.on('flush', flush_stats);
  events.on('status', backend_status);

  return true;
};

function flattenJson(json) {
  var result = {};
  var toType = function(obj) {
    return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase();
  };

  var flattenJsonRecurse = function(json, prefix) {
    var key, item;

    for( key in json ) {
      if ( json.hasOwnProperty(key) ) {
        item = json[key];

        if ( toType(item) === 'object' ) {
          flattenJsonRecurse(item, key+'.');
        } else if ( typeof item !== 'undefined' && item !== null ) {
          if ( toType(item) === 'array' && item.length === 1 ) {
            result[prefix + key] = item[0];
          } else {
            result[prefix + key] = item;
          }
        }
      }
    }

  };

  flattenJsonRecurse(json, '');
  return result;
}
