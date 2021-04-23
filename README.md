# Welcome to @Hoctail/client
[![Version](https://img.shields.io/npm/v/@hoctail/client.svg)](https://www.npmjs.com/package/@hoctail/client)
[![Documentation](https://img.shields.io/badge/documentation-yes-brightgreen.svg)](https://hoctail.github.io/hoctail/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/Hoctail/client/blob/master/LICENSE)

> [**Hoctail**](https://demo.hoctail.io/sys/signup) is a hosting platform for javascript web applications.
> It's in demo stage and only **available for testing**.  
> Hoctail client is an interactive console that runs locally and is using an API to interact with **Hoctail** server.  

### 🏠 [Homepage](https://github.com/hoctail/client)

## Install

Install the client, create and export [API key](https://hoctail.github.io/hoctail/tutorial-api-keys.html)
```
npm install @hoctail/client
export HOCTAIL_API_KEY=Your-API-Key-Here
```

# Hoctail server application
> *Hoctail server app* is a typical [Expressjs](https://expressjs.com/) application we run in a virtual server.
> Every Hoctail app has an endpoint that looks like <span style='color:blue'>*demo.hoctail.io/username/myapp*</span>. 

In order to get your application alive at first you have to [sign-up](https://demo.hoctail.io/sys/signup/)
and create a new application in the browser.  
A default application will be available on the endpoint associated with your app.  
You can replace it by installing your own app from the `hoctail` cli.  
Add dependencies to your package.json and run the `serve` command.

*Note:* if you have no other deps you don't need to have `package.json` at all.

# Hoctail client
## Hoctail client can serve an application on the platform
```bash
# optionally specify `--key` if you didn't export HOCTAIL_API_KEY
hoctail --app MyApp serve /local/path/to/app
```

## Run code in an interactive mode (REPL)
```bash
# optionally specify `--key` if you didn't export HOCTAIL_API_KEY
hoctail --app MyApp
```
While in REPL try `.help` for information about custom commands.
For instance `.sql` command runs a sql query, and `.logs` command fetches the latest app logs.  
You can also run javascript code in there.

*Note:* REPL supports [top-level await](https://github.com/tc39/proposal-top-level-await)

## Execute javascript
You can make API calls directly from REPL or from your own script.
For example, to run a script:
```bash
hoctail --app MyApp /path/to/your/script.js
```
*Note:* the scripts run locally in a hoctail REPL, you need to use `await hoctail.wait()`, `await hoctail.run()`
or other APIs to run code in a virtual server context

script.js

```js
const result = await hoctail.wait(async () => {
  const fetch = require('node-fetch')
  try {
    // fetches DiditalOcean status data
    const data = await fetch('https://s2k7tnzlhrpw.statuspage.io/api/v2/status.json')
    const text = await data.text()
    return text
  } catch (e) {
    return e
  }
})
console.log(result)
```
Run it:
```
$ hoctail --app MyApp ./sript.js 
{"page":{"id":"s2k7tnzlhrpw","name":"DigitalOcean","url":"http://status.digitalocean.com","time_zone":"Etc/UTC",
"updated_at":"2021-04-19T19:01:56.585Z"},"status":{"indicator":"none","description":"All Systems Operational"}}
$
```


# Client-side javascript API
Client interacts with a server using a [NodeClient](https://hoctail.github.io/hoctail/module-nodejs-NodeClient.html) API.
The REPL context contains `hoctail` global object - a configured instance of *NodeClient* that can be used.  
Client API can run queries, fetch logs or even run javascript code on a server in the **sandbox**, see below.

# Server-side javascript API (sandbox)
Each Hoctail application has a set of pre-created tables/views like `logs` in its own schema. Use the `.relations` command to check it out.  
A global [hoc](https://hoctail.github.io/hoctail/hoc.html) object is available in your javascript server app.
It can be used to access the platform server side APIs.

# Example server app

Create `express` app

MyApp.js

```js
const express = require('express')
const fetch = require('node-fetch')
const app = express()

// simple string response
app.get('/', (req, res) => res.send('Hello world'))
// use stored procedure/function call
app.get('/time', (req, res) => res.send(Date(hoc.call('now')).toString()))
// use raw SQL results
app.get('/requests', (req, res) => res.send(hoc.sql('select * from http_srv_logs')))
// use async function and fetch from a remote service
app.get('/google', async (req, res, next) => {
  try {
    const data = await fetch('https://google.com')
    const text = await data.text()
    res.send(text)
  } catch (e) {
    next(e)
  }
})
// don't forget to call listen()
// TCP port argument (3000) will be ignored
app.listen(3000, () => {
  // will be sent to the app logs, run .logs from CLI
  console.log('MyApp is listening')
})
```

To deploy your app:

```
$ hoctail --app MyApp serve ./MyApp.js

Will initialize app →  MyApp :

Will serve at →  MyApp :
  /home/user/MyApp/MyAppjs → ./server

Your app is serving at: https://demo.hoctail.io/user@example.com/MyApp/
$ 
```

Now you should be able to send requests

```
$ curl https://demo.hoctail.io/user@example.com/MyApp/
Hello world
$ 
```

# CLI reference

```bash
$ hoctail --help
Usage: hoctail [options] [command]

Options:
  -V, --version                output the version number
  --endpoint <endpoint_url>    Hoctail Endpoint url, env: HOCTAIL_ENDPOINT
  --key <api_key>              Hoctail API key, env: HOCTAIL_API_KEY
  --app <app_name>             Hoctail app name, format: 'owner/name', env: HOCTAIL_APP
  --log-level <log_level>      Minimal log level, default: LOG, env: HOCTAIL_LOG_LEVEL
  -h, --help                   display help for command

Commands:
  serve [path]                 serve a local `expressjs` app on server, default: [path] = .
  install <path> [serverPath]  install a local npm pkg/module on server, optionally use a server path
          			examples:
          			  hoctail install ./index.js : install a package from an entrypoint file
          			  hoctail install some-package : install a local npm package
          			  hoctail install ./module.js ./module : install a local entrypoint as require('./module')
  repl [script]                launch repl
  help [command]               display help for command

Simple call will launch repl:
  $ hoctail
  hoctail> 

```

## Serve

Serve a local npm app

1. Create API key in the Hoctail UI
1. Create your app in the Hoctail UI (name: `MyApp`)
1. Run the following:
```bash
$ mkdir MyApp
$ cd MyApp
$ npm init
$ npm install .... your dependencies ....
.....
$ npm install --dev @hoctail/client

.... create index.js with your app code

$ export HOCTAIL_KEY='your-api-key'
$ hoctail --app MyApp serve
$ 
```

## Install

Advanced option, if you need to install specific dependencies into the sandbox.  
Usually it's not needed as your local dependencies get packed and bundled with your app in `serve`

### Install package from its entry point

```bash
$ cd node_modules/package
$ hoctail install ./index.js
```

### Shortcut to above

```bash
$ hoctail install package
```

### Install a `local` module

```bash
$ hoctail install ./index.js ./package
```
Now you can require it in your app or server code
```bash
$ hoctail --app MyApp
user@MyApp> await hoctail.wait(() => {
  const pkg = require('./package')
  return pkg.func()
})
```

## Author

👤 **Hoctail**

## 🤝 Contributing

Contributions, issues and feature requests are welcome!

Feel free to check [issues page](https://github.com/Hoctail/client/issues). 

