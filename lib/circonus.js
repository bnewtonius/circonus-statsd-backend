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
 * Collect and flatten counters from statsd
 * @param  {Object} stats    Collector of stats
 * @param  {Object} counters Counters collection from statsd
 * @return {Number}          Count of stats collected
 */
var collectCounters = function(stats, counters, counter_rates) {
  var key, count = 0;

  for (key in counters) {
    stats[key + '.counter'] = counters[key];
    stats[key + '.counter_rate'] = counter_rates[key];
    count += 2;
  }

  return count;
};

/**
 * Collect and flatten timer and timer data from statsd
 * @param  {Object} stats       Collector of stats
 * @param  {Object} timers      Raw timer data collection from statsd
 * @param  {Object} timer_data  Timer data (mean, avg, etc) collection from statsd
 * @return {Number}             Count of stats collected
 */
var collectTimers = function(stats, timers, timer_data) {
  var tkey, tdkey, count = 0, tdobj;

  for (tkey in timers) {
    if (timers[tkey].length > 0) {

      for ( tdkey in timer_data[tkey] ) {
        stats[tkey+'.timer.'+tdkey] = timer_data[tkey][tdkey];
        count++;
      }
    }
  }

  return count;
};

/**
 * Collect and flatten gauges from statsd
 * @param  {Object} stats    Collector of stats
 * @param  {Object} gauges   Gauges collection from statsd
 * @return {Number}          Count of stats collected
 */
var collectGauges = function(stats, gauges) {
  var key, count = 0;

  for (key in gauges) {
    stats[key + '.gauge'] =  gauges[key];
    count++;
  }

  return count;
};

/**
 * Collect and flatten sets from statsd
 * @param  {Object} stats    Collector of stats
 * @param  {Object} sets     Sets collection from statsd
 * @return {Number}          Count of stats collected
 */
var collectSets = function(stats, sets) {
  var key, count = 0;

  for (key in sets) {
    stats[key + '.set.count'] = sets[key].values().length;
    count++;
  }

  return count;
};

/**
 * Flush event handler. Collects and flattens statsd data to send to circonus
 * and then calls post_stats(stats) to send the data to circonus via https.
 * @param  {[type]} ts      [description]
 * @param  {Object} metrics Metrics collected by statsd during this interval
 */
var flush_stats = function circonus_flush(ts, metrics) {
  var
    start = Date.now(),
    stats = {},
    numStats = 0;

  numStats = (
    collectCounters(stats, metrics.counters, metrics.counter_rates) +
    collectTimers(stats, metrics.timers, metrics.timer_data) +
    collectGauges(stats, metrics.gauges) +
    collectSets(stats, metrics.sets)
  );

  stats['statsd.numStats'] = numStats;
  stats['statsd.circonusStats.calculationTime'] =  + (Date.now() - start);

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
