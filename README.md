circonus-statsd-backend
==========================

Backend plugin for [statsd](https://github.com/etsy/statsd) to publish output to the [circonus](http://www.circonus.com) custom metrics API over HTTPS.

### Installation

Install [statsd](https://github.com/etsy/statsd) normally.  We'll call the root directory of the statsd install ```$STATSD_HOME```

From your ```$STATSD_HOME``` directory run ```$ npm install circonus-statsd-backend``` will install this module into the appropriate place, and the configurations below will reference it as a backend.

For now you can pull [circonus.js](https://github.com/lyft/circonus-statsd-backend/blob/master/lib/circonus.js) and put it in the backends directory of your statsd and it will
be configurable like below.

### Configuration Examples

To set up the circonus backend, you need a [circonus account](https://www.circonus.com/) and [API key](https://login.circonus.com/resources/api).  Everything else is optional.  Any of the configurations below can be put into a circonusConfig.js and used as a statsd config on startup.

```$ bin/statsd circonusConfig.js```

```js
{
    backends: [ "circonus-statsd-backend" ],
    circonus: {
        trapURL: "YOUR_TRAP_URL_HERE"
    }
}
```

To output additional logging information, add the debug parameter set to true.  It will be more verbose, and can be helpful to tell what exactly is being sent to [circonus](http://www.circonus.com).

```js
{
    backends: [ "circonus-statsd-backend" ],
    circonus: {
        trapURL: "YOUR_TRAP_URL_HERE"
        debug: "true"
    }
}
```

### Using development versions of Circonus with self-signed certificates

If you are using a develoment version of circonus and you are using a self signed certificate, you may get this error (assuming you have the debug flags set to true):

> Error making circonus request: SELF_SIGNED_CERT_IN_CHAIN

For develoment only, you can set this environment variable prior to starting your statsd daemon

```bash
export NODE_TLS_REJECT_UNAUTHORIZED="0"
```

**Do not use this in production. It is unsafe.**
