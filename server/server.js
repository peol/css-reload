/* global console */

"use strict";

var path = require( "path" );
var fs = require( "fs" );
var socketio = require( "socket.io" );
var gaze = require( "gaze" );

module.exports = function( basePath, port, debug ) {
	function log() {
		if ( debug ) {
			var args = Array.prototype.slice.call( arguments );
			args.unshift( "[CR]" );
			console.log.apply( console, args );
		}
	}
	var server = socketio.listen( port, {
		"resource": "/cr",
		"log level": debug ? 5 : 1,
		"browser client cache": !debug
	} );

	server.static.add( "/css-reload.js", {
		file: "client/css-reload.js"
	} );

	var watchCache = {};
	var paths = [basePath + "/**/*.css"];

	if ( debug ) {
		paths.push( basePath + "/client/css-reload.js" );
	}

	console.log( "[CR] Port: %d", port );
	console.log( "[CR] Base path: '%s'", basePath );
	console.log( "[CR] Tag to add to your document: <script src=\"http://localhost:%d/lr/css-reload.js\"></script>", port );

	gaze( paths, function() {
		this.on( "changed", function( fullFile ) {
			var file = fullFile.replace( basePath, "" );
			console.log( "File '%s' changed", file );

			if ( file === "/client/css-reload.js" ) {
				server.sockets.emit( "reloadPage" );
			} else {
				var cache = watchCache[fullFile];
				if ( cache ) {
					fetchFile( fullFile, function( content ) {
						cache.forEach( function( socket ) {
							socket.emit( "fileChanged", file, content );
						} );
					} );
				}
			}
		} );
	} );

	function fetchFile( fullFile, callback ) {
		// todo: support external URLs as well?
		callback( fs.readFileSync( fullFile ).toString() );
		log( "Read contents of file '%s'", fullFile );
	}

	function watchFile( socket, file ) {
		var fullFile = path.normalize( basePath + file );
		var cache = watchCache[fullFile] = watchCache[fullFile] || [];
		cache.push( socket );
		socket.on( "disconnect", function( ) {
			log( "Stopped watching '%s' for socket '%s'", file, socket.id );
			cache.splice( cache.indexOf( socket ), 1 );
		} );
	}

	server.on( "connection", function( socket ) {
		socket.on( "fileAdded", function( file ) {
			log( "Started watching '%s' for socket '%s'", file, socket.id );
			watchFile( socket, file );
		} );
	} );
};