/*
 * apidoc
 * http://apidocjs.com
 *
 * Copyright (c) 2013-2016 inveris OHG
 * Author Peter Rottmann <rottmann@inveris.de>
 * Licensed under the MIT license.
 */

const _ = require('lodash');
const apidoc = require('apidoc-core');
const fs = require('fs-extra');
const path = require('path');
const winston = require('winston');
let Markdown = require('markdown-it');

const PackageInfo = require('./packageInfo');

const apidocPostmanV21 = require('./apidocToPostmanV21');

const defaults = {
  dest: path.join(__dirname, '../doc/'),
  template: path.join(__dirname, '../template/'),

  debug: false,
  silent: false,
  verbose: false,
  simulate: false,
  parse: false, // Only parse and return the data, no file creation.
  colorize: true,
  markdown: true,
  config: './',
  apiprivate: false,
  encoding: 'utf8'
};

const app = {
  log: {},
  markdownParser: null,
  options: {}
};

// Display uncaught Exception.
process.on('uncaughtException', function (err) {
  console.error(new Date().toUTCString() + ' uncaughtException:', err.message);
  console.error(err.stack);
  process.exit(1);
});

/**
 * Create Postman collection
 *
 * @param  {Object} options See defaults and apidoc-core defaults for all options / `apidoc --help`
 * @return {Mixed} true = ok, but nothing todo | false = error | Object with parsed data and project-informations.
 */
function createCollection(options) {
  let api;
  const apidocPath = path.join(__dirname, '../');
  let markdownParser;
  let packageInfo;

  options = _.defaults({}, options, defaults);

  // Paths.
  options.dest = path.join(options.dest, './');
  options.template = path.join(options.template, './');

  // Line-Ending.
  if (options.lineEnding) {
    if (options.lineEnding === 'CRLF') {
      options.lineEnding = '\r\n';
    } else if (options.lineEnding === 'CR') {
      // win32
      options.lineEnding = '\r';
    } else {
      // darwin
      options.lineEnding = '\n';
    } // linux
  }

  // Options.
  app.options = options;
  // console.log(options);
  // Logger.
  app.log = new winston.Logger({
    transports: [
      new winston.transports.Console({
        level: app.options.debug ? 'debug' : app.options.verbose ? 'verbose' : 'info',
        silent: app.options.silent,
        prettyPrint: true,
        colorize: app.options.colorize,
        timestamp: false
      })
    ]
  });

  // Markdown Parser: enable / disable / use a custom parser.
  if (app.options.markdown === true) {
    markdownParser = new Markdown({
      breaks: false,
      html: true,
      linkify: false,
      typographer: false
    });
  } else if (app.options.markdown !== false) {
    // Include custom Parser @see MARKDOWN.md and test/fixtures/custom_markdown_parser.js
    Markdown = require(app.options.markdown); // Overwrite default Markdown.
    markdownParser = new Markdown();
  }
  app.markdownParser = markdownParser;

  try {
    packageInfo = new PackageInfo(app);

    // generator information
    const json = JSON.parse(fs.readFileSync(apidocPath + 'package.json', 'utf8'));
    apidoc.setGeneratorInfos({
      name: json.name,
      time: new Date(),
      url: json.homepage,
      version: json.version
    });
    apidoc.setLogger(app.log);
    apidoc.setMarkdownParser(markdownParser);
    apidoc.setPackageInfos(packageInfo.get());

    api = apidoc.parse(app.options);

    if (api === true) {
      app.log.info('Nothing to do.');
      return true;
    }
    if (api === false) {
      return false;
    }

    if (app.options.parse !== true) {
      const apidocData = JSON.parse(api.data);
      const projectData = JSON.parse(api.project);
      const appOption = app.options;
      api['postmanCollection'] = JSON.stringify(apidocPostmanV21.toCollection(apidocData, projectData, appOption));

      createOutputFile(api);
    }

    app.log.info('Done.');
    return api;
  } catch (e) {
    console.log(e);
    app.log.error(e.message);
    if (e.stack) {
      app.log.debug(e.stack);
    }
    return false;
  }
}

/*
 * Save parsed data to postman.json file
 *
 * Adapted from createOutputFiles(api) of original apidoc/lib/index.js
 *
 */
function createOutputFile(api) {
  if (app.options.simulate) {
    app.log.warn('!!! Simulation !!! No file or dir will be copied or created.');
  }

  app.log.verbose('create dir: ' + app.options.dest);
  if (!app.options.simulate) {
    fs.mkdirsSync(app.options.dest);
  }

  // Write Postman collection
  app.log.verbose('write Postman collection file: ' + app.options.dest + 'postman.json');
  if (!app.options.simulate) {
    const exportFilename = app.options.exportFilename;
    fs.writeFileSync(app.options.dest + `./${exportFilename}.json`, api.postmanCollection);
  }
}

module.exports = {
  createCollection: createCollection
};
