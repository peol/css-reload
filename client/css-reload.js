/* global console, io, CSSImportRule */
/*!
 * css-reload
 * https://github.com/peol/css-reload/
 * MIT/GPL Dual License, use whatever fits your project.
 * Copyright(C) Andrée Hansson (@peolanha) 2013
 */
 ( function() {
	"use strict";

	var filesToWatch = [];
	var fileToStyle = [];
	var socket;

	/**
	 * Convert an array-like object into an actual array.
	 */
	function toArray( arrayLike ) {
		return Array.prototype.slice.call( arrayLike );
	}

	/**
	 * Normalize a filename by removing origin URL and making sure it's
	 * always an absolute URL. Also resolves relative URLs like foo/../bar.
	 */
	function normalize( file, parent ) {
		var path = file.replace( location.origin, "" );
		var normalized = [];

		path.split( "/" ).forEach( function( part ) {
			if ( part === ".." ) {
				normalized.pop();
			} else {
				normalized.push( part );
			}
		} );

		path = normalized.join( "/" );

		if ( path[0] !== "/" ) {
			if ( !parent ) {
				path = location.pathname + path;
			} else {
				path = normalize( parent ).split( "/" ).slice( 0, -1 ).join( "/" ) + "/" + path;
			}
		}

		return path.split( "?" )[0];
	}

	/**
	 * Add a file to watch list. By doing this it will replace the <link> element
	 * with an <style> element. This is done because we want to make sure that
	 * CSS inheritance works, even in cases with @import statements and we don't
	 * want to reload unnecessary files (i.e the @import statements) since those files
	 * are already handled individually.
	 */
	function add( file, style, media ) {
		if ( filesToWatch.indexOf( file ) === -1 ) {
			media = media.length ? media : ["all"];
			filesToWatch.push( file );
			var elem = fileToStyle[file] = document.createElement( "style" );
			elem.id = "CR-" + file;
			elem.media = toArray( media ).join( "," );

			if ( style.ownerNode ) {
				style.ownerNode.parentElement.appendChild( elem );
				style.ownerNode.parentElement.removeChild( style.ownerNode );
			} else {
				// todo: if this is an @import, we need to make sure its <style> element is added in the right
				// order here
				document.head.appendChild( elem );
			}

			if ( socket ) {
				socket.emit( "fileAdded", file );
			}

			console.log( "[CR] Started watching '%s'", file );
		} else {
			console.warn( "[CR] Already watching '%s', you probably have duplicates in your document -- css-reload does not behave correctly with duplicates!", file );
		}
	}

	/**
	 * Set the content of a watched file's CSS.
	 */
	function set( file, content, isInitial ) {
		fileToStyle[file].innerHTML = content;

		if ( !isInitial ) {
			console.log( "[CR] Updated '%s'", file );
		}
	}

	/**
	 * Parses a CSSStyleSheet object and starts the watcher and
	 * converter to set the stylesheet up for css-reloading.
	 */
	function parseStyle( style, media ) {
		media = media || ["all"];

		if ( !style.href ) {
			return;
		}

		var file = normalize( style.href );
		var content = "";

		toArray( style.cssRules ).forEach( function( rule ) {
			if ( rule instanceof CSSImportRule ) {
				parseStyle( rule.styleSheet, rule.media );
			} else {
				if ( rule.cssText ) {
					content += rule.cssText + "\n";
				}
			}
		} );

		add( file, style, media );
		set( file, content, true );
	}

	/**
	 * Refreshes the watcher by parsing the document.styleSheets
	 * list.
	 */
	function refresh() {
		toArray( document.styleSheets ).forEach( function( style ) {
			parseStyle( style );
		} );
	}

	/**
	 * Updates all converted @import <style> elements with the media
	 * set in the CSS content. Returns CSS content with @import's
	 * and comments stripped out.
	 */
	function updateImports( file, content ) {
		var re_comment = /\/\*([\s\S]+)?\*\//g;
		var re_import = /@import (?:url\()?\s*["'](.+?)["']\s*(?:\))?\s*(?:(.+?))?;/g;
		var m1;
		var m2;
		var style;
		var normalized;

		// find all comments, and look inside them for @import's:
		while ( m1 = re_comment.exec( content ) ) {
			while ( m2 = re_import.exec( m1[1] ) ) {
				normalized = normalize( m2[1] );
				if ( fileToStyle[normalized] ) {
					console.log( "[CR] File '%s' has been commented out -- unloading CSS on-the-fly is currently unsupported", normalized );
				}
			}
		}

		// remove commented stuff:
		content = content.replace( re_comment, "" );

		// go through all @import's and update the (potential) media query for it:
		while ( m1 = re_import.exec( content ) ) {
			normalized = normalize( m1[1], file );
			style = fileToStyle[normalized];
			if ( style ) {
				style.media = m1[2] || "all";
			} else {
				console.log( "[CR] File '%s' is new -- loading CSS on-the-fly is currently unsupported", normalized );
			}
		}

		// remove all @import's:
		content = content.replace( re_import, "" );

		return content;
	}

	/**
	 * Bootstrap the reloader. It automatically injects
	 * the socket.io stuff needed and starts the timer that
	 * automatically refreshes the internal caches.
	 */
	function run() {
		var url = document.querySelector( "script[src*='css-reload.js']" ).src.split( "/css-reload.js" )[0];
		var ioElem = document.createElement( "script" );

		ioElem.onload = function() {
			socket = io.connect( url.split( "/" ).slice( 0, -1 ).join( "/" ), {
				resource: "cr"
			} );

			socket.on( "connect", function() {
				// make sure that any pre-parsed files are added to the server watch list:
				filesToWatch.forEach( function( file ) {
					socket.emit( "fileAdded", file );
				} );
			} );

			socket.on( "reloadPage", function() {
				// used by CR when developing, automatically refreshes page when the css-reload.js
				// file is changed. Could potentially be used in cases where a total reload of the document is needed.
				location.reload();
			} );

			socket.on( "fileChanged", function( file, content ) {
				// make sure we parse and clean the new content for @import's:
				content = updateImports( file, content );
				// update the CR <style> element with the new content:
				set( file, content );
			} );
		};

		refresh();
		setInterval( refresh, 1000 );

		ioElem.src = url + "/socket.io.js";
		document.head.appendChild( ioElem );
	}

	run();
}() );