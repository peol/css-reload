/*global module:false*/
module.exports = function( grunt ) {
	grunt.initConfig( {
		jshint: {
			options: {
				jshintrc: ".jshintrc"
			},
			all: [
				"bin/css-reload",
				"**/*.js",
				"!node_modules/**/*.js"
			]
		},
		watch: {
			all: {
				files: "<%= jshint.all %>",
				tasks: ["jshint"]
			}
		}
	} );

	grunt.loadNpmTasks( "grunt-contrib-jshint" );
	grunt.loadNpmTasks( "grunt-contrib-watch" );
	grunt.registerTask( "default", ["jshint"] );
};