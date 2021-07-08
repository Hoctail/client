# Welcome to @Hoctail/client
[![Version](https://img.shields.io/npm/v/@hoctail/client.svg)](https://www.npmjs.com/package/@hoctail/client)
[![Documentation](https://img.shields.io/badge/documentation-yes-brightgreen.svg)](https://hoctail.github.io/hoctail/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/Hoctail/client/blob/master/LICENSE)

> [**Hoctail**](https://demo.hoctail.io/sys/signup) is a hosting platform for javascript web applications.
> It's in demo stage and only **available for testing**.  
> Hoctail client is an interactive console that runs locally and is using an API to interact with **Hoctail** server.  

## 🏠 [Homepage](https://github.com/hoctail/client)

## Index
* [Install](#install)
* [Api Key](#api-key)
* [Node client API](#node-client)
* [Deploy express app](#deploy-express)
* [Deploy mini app](#deploy-mini)
* [Run code](#run-code)
  * [Interactive mode (REPL)](#run-repl)
  * [Execute a script file](#run-script)
* [CLI reference](#cli)

## Install <a name="install"></a>

```
npm install @hoctail/client
```

## Api Key <a name="api-key"></a>
Create Api Key as shown [here](https://hoctail.github.io/hoctail/tutorial-api-keys.html).
Then create a project's folder on your pc, and create `.env` file with contents like here:
```
HOCTAIL_API_KEY=Your-API-Key-Here
```
or export environment variables: `HOCTAIL_API_KEY` - Api key, `HOCTAIL_APP` - user app.
Every time when CLI is executed it will connect to a server using above settings. 

## Node client API <a name="node-client"></a>
CLI assigns an instance of configured <b>[Node client](https://hoctail.github.io/hoctail/module-nodejs-NodeClient.html)</b> to `hoctail` global variable. It provides an API for working with a remote application to run queries, fetch logs or run javascript code on a server in the **sandbox**. On server-side each application have a global <b>[hoc](https://hoctail.github.io/hoctail/hoc.html)</b> object, that can be used to access the platform APIs. Here some examples on how `hoctail`, `hoc` objects can be used:
``` js
await hoctail.wait(() => { return hoc.schema /*server-side context*/ })
await hoctail.run(() => { /*server-side context*/ })
```

## CLI can deploy [Hoctail Applications](tutorial-applications.html)
> Application is a single *js* file without specific dependencies or a folder containing a `package.json`.

### Deploy <b>[Expressjs](tutorial-applications.html#app-type-express)</b> app <a name="deploy-express"></a>
Check a complete express app example [here](tutorial-applications.html#express-app-example).
Here are generic steps to serve it:

1. Go to a local `nodejs` dev environment
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

### Deploy <b>[Mini](tutorial-applications.html#app-type-mini)</b> app <a name="deploy-mini"></a>
Run it:
```
$ hoctail --app MyMiniApp mini ./index.js
Will initialize app →  MyMiniApp :
Will update 'mini' app →  MyMiniApp :
bundle size: 1303 bytes 
```

## Run code <a name="run-code"></a>
CLI executes a source code provided by user in a local `nodejs` environment. *Node Client* is using to run code provided by user in application's context on a server-side. 

### Interactive mode (REPL) <a name="run-repl"></a>
To enter REPL mode run `hoctail` CLI without command arguments:
```bash
hoctail --app MyApp
[user]@app> await hoctail.wait(() => hoc.schema)
[user]@app> .help
```
REPL prompt is showing `[user]@app>` info about current execution context.
Try `.help` for information about standard REPL commands.
<br>For instance `.sql` command runs a sql query, and `.logs` command fetches the latest app logs.  
> *Note*: REPL supports [top-level await](https://github.com/tc39/proposal-top-level-await).

### Execute a script file <a name="run-script"></a>
Users can run their (deployment) scripts:

```js
// script.js
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

# CLI reference <a name="cli"></a>

```bash
$ hoctail --help
Usage: hoctail [options] [command]

Options:
  -V, --version                output the version number
  --endpoint <endpoint_url>    Hoctail Endpoint url, env: HOCTAIL_ENDPOINT
  --key <api_key>              Hoctail API key, env: HOCTAIL_API_KEY
  --app <app_name>             Hoctail app name, format: 'owner/name', env:
                               HOCTAIL_APP
  --log-level <log_level>      Minimal log level, default: LOG, env:
                               HOCTAIL_LOG_LEVEL
  -h, --help                   display help for command

Commands:
  env <cmd>                    manipulate env variables
          			examples:
          			  hoctail env show : show all the remote app env variables
          			  hoctail env push : replace app env variables with the contents of local .env file
          			  hoctail env pull : download remote app variables to a local .env file
          
  serve [path]                 serve a local `expressjs` app on server,
                               default: [path] = .
  install <path> [serverPath]  install a local npm pkg/module on server, optionally use a server path
          			examples:
          			  hoctail install ./index.js : install a package from an entrypoint file
          			  hoctail install some-package : install a local npm package
          			  hoctail install ./module.js ./module : install a local entrypoint as require('./module')
  mini <path>                  install UI app type = 'mini'. path - is path to single js file or npm package.
        			examples:
        			  hoctail mini ./index.js : use single js file
        			  hoctail mini some-package : use a local npm module
  dryRunMini <path>            Will only create a bundle. path - is path to js file or npm package.
        			examples:
        			  hoctail mini ./index.js : use single js file
        			  hoctail mini some-package : use a local npm module
  repl [script]                launch repl
  help [command]               display help for command

Simple call will launch repl:
  $ hoctail
  hoctail> 
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

### Environment variables

Get the current env variables for an app

```bash
$ hoctail env show
{}
```

Use a local `.env` file to push and synchronize env variables

```bash
$ cat .env
HOCTAIL_API_KEY=f5eb18b6-b593-11eb-9a4b-0b6531f7e888
HOCTAIL_APP='My App'
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

$ hoctail env push
{
  AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
  AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
}
```

_Note: `HOCTAIL_*` env vars are not pushed to server, these are CLI specific_

You can also pull remote vars locally

```bash
$ hoctail env pull
{
  NODE_ENV: 'production'
}

$ cat .env
HOCTAIL_API_KEY=f5eb18b6-b593-11eb-9a4b-0b6531f7e888
HOCTAIL_APP='My App'
NODE_ENV='production'

```

_Note: need to restart the app to pick up new env vars in most cases, (`hoctail serve` will restart for you)_

## Author

👤 **Hoctail**

## 🤝 Contributing

Contributions, issues and feature requests are welcome!

Feel free to check [issues page](https://github.com/Hoctail/client/issues). 

