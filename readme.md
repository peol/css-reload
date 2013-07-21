# css-reload
This project is aimed to support css-reloading of CSS that not only uses `<link>` elements, but also `@import` statements. All CSS files are reloaded separately which means that re-paints in the browser should be rather fast compared to other css-reload projects.

## Installation
css-reload works best as a globally installed binary, like so:
```
$ npm install -g css-reload
$ cd my/project/root
$ css-reload
```
The server will give you the link to the client JavaScript file that you put in your document. Once that's done you can start using it!

For advanced options, you can look into the help:
```
$ css-reload --help

  Usage: css-reload [options]

  Options:

    -h, --help         output usage information
    -p, --port <port>  which port to run the server on (default 51000)
    -d, --dir <path>   which path to use as root (default current directory)
    -D, --debug        enable debug output (default false)

```

## FAQ
Q: Why another live-reload project?

A: I wasn't happy with the ones I've tried (they either were too complex to set-up, didn't support `@import`'s or was using polling). It was also a fun project to create.

Q: Why use `@import`'s anyways, aren't they bad from a performance perspective?

A: Yes, they do have some performance problems in older browsers but `@import` is a common way to structure your CSS in projects that either uses pre-processors, and/or projects that use require.js -- which automatically inlines `@import`'s for production.

## How does it work?
css-reload runs a server in a CLI using [socket.io](http://socket.io/) and file watchers. The client tells the server which files it wants to watch and automatically gets notifications when the files are changed.

The client works by parsing `document.styleSheets` and converts them to `<style>` elements and then removes the `<link>` elements. This way we can ensure that we can reload specific files without affecting others unnecessarily. After the initial "conversion", the file content is pushed from the server to the client and it updates the `<style>` elements accordingly (with some added logic for parsing and removing `@import`'s).

## Todo
* Support dynamically adding/removing @import's
* Clean up code style (formatting)
* Refactor code, make it a bit cleaner
* Create a grunt task using this project
* Unit testing

## Limitations
Currently, it does not support adding or removing `@import`'s on-the-fly. Due to the approach using `<style>` elements, the comfort of having line numbers in the css list in DevTools are gone. If you need to debug your CSS, you should disable css-reload while doing so.

# Contributing
I've been playing around with JavaScript formatters and the current style is not the best. If you want to contribute, the main thing is to follow the code (i.e. always use braces etc.) but you can disregard the actual style. JSHint should pass and you should also document any new code you write by following the style of documentation that already exists.

# License
This project is dual-licensed. You can either use MIT, or if your project needs to, a GPL license. Use whatever fits your project.