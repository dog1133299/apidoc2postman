const _ = require('lodash');
const {
  getReasonPhrase,
} = require('http-status-codes');
const collectionSchema = {
  info: {
    name: '',
    description: '',
    version: '',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/'
  },
  item: []
};
let apiRoot = '{{base_url}}';
let sortByType = 'verbs';

const HTTP_VERBS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'copy',
  'head',
  'options',
  'link',
  'unlink',
  'purge',
  'lock',
  'unlock',
  'propfind',
  'view'
];

function toCollection(apidocJson, projectJson, appOption) {
  sortByType = appOption.sortby || 'verbs';
  apiRoot = projectJson.sampleUrl || '{{base_url}}';
  // Create Postman collection to be returned - starting from collectionSchema
  const collection = _.cloneDeep(collectionSchema);
  // Set collection info
  setInfo(collection, projectJson);
  // Set collection items
  setItems(collection, apidocJson);
  return collection;
}

function setInfo(collection, projectJson) {
  _.set(collection, 'info.name', projectJson.name);
  _.set(collection, 'info.description', projectJson.description);
  _.set(collection, 'info.version', projectJson.version);
}

function setItems(collection, apidocJson) {
  const apiFolders = _.groupBy(apidocJson, 'group');
  _.set(
    collection,
    'item',
    _.chain(apiFolders)
      .map((apis, groupName) => _mapApiFolder(groupName, apis))
      .filter((f) => f.item.length > 0)
      .value()
  );
}
function _getSuccessStatusCode(fields) {
  if (fields) {
    const status = _.keys(fields)[0].split(' ');
    const code = _.isUndefined(status[1]) ? status[0] : status[1];

    return {
      status: getReasonPhrase(code),
      code: code,
    };
  }
}
function _mapApiFolder(groupName, apis) {
  return {
    name: groupName,
    item: _.chain(apis)
      .filter((a) => HTTP_VERBS.includes(a.type.toLowerCase()))
      .sortBy((a) => _apiSorter(a, sortByType))
      .map(_mapApiItem)
      .value()
  };
}

function _mapApiItem(apiItem) {
  return {
    name: `${apiItem.name}|${apiItem.title}`,
    request: {
      auth: _mapAuth(apiItem),
      method: apiItem.type.toUpperCase(),
      header: [
        {
          key: 'Content-Type',
          value: 'application/json'
        },
        ..._mapHeader(apiItem),
        {
          key: 'x-api-key',
          value: '{{x-api-key}}',
          disabled: true
        }
      ],
      body: {
        mode: 'raw',
        raw: _mapBody(apiItem)
      },
      url: {
        'raw': apiRoot + apiItem.url,
        'host': [
          apiRoot
        ],
        'path': apiItem?.url?.split('/'),
        'query': mapQuery(apiItem?.parameter?.fields)
      },
      description: apiItem?.description
    },
    response: _.map(
      apiItem.success?.examples,
      (success, index) => ({
        name: `Response`,
        originalRequest: {
          method: apiItem.type.toUpperCase(),
          header: [
            {
              key: 'Content-Type',
              value: 'application/json'
            }
          ],
          body: {
            mode: 'raw',
            raw: _mapBody(apiItem),
            options: {
              raw: {
                language: 'json'
              }
            }
          },
          url: {
            raw: '{{MOCK_SERVER}}' + apiItem.url,
            host: [
              '{{MOCK_SERVER}}'
            ],
            path: apiItem?.url?.split('/'),
          }
        },
        ..._getSuccessStatusCode(apiItem.success.fields),
        _postman_previewlanguage: 'json',
        header: [
          {
            key: 'Content-Type',
            value: 'application/json',
          }
        ],
        body: success.content
      })

    )

  };
}

function _mapHeader(apiItem) {
  // console.log(apiItem?.header?.fields?.Header)
  if (Array.isArray(apiItem?.header?.fields?.Header)) {
    return apiItem.header.fields.Header.map((item) => {
      return {
        key: item.field,
        value: item.type,
        description: item.description
      };
    });
  }
  return [];
}

function _mapAuth(apiItem) {
  const permission = _.get(apiItem, 'permission[0]');
  if (permission) {
    const isBasicAuth = permission.name === 'basic';

    return {
      type: !isBasicAuth ? 'bearer' : 'basic',
      basic: isBasicAuth ?
        [
          {
            key: 'password',
            value: '{{basic_password}}',
            type: 'string'
          },
          {
            key: 'username',
            value: '{{basic_username}}',
            type: 'string'
          },
          {
            key: 'showPassword',
            value: false,
            type: 'boolean'
          }
        ] :
        [],
      bearer: !isBasicAuth ?
        [
          {
            key: 'token',
            value:
              permission.name !== 'token' ?
                '{{' + permission.name + '_token}}' :
                '{{token}}',
            type: 'string'
          }
        ] :
        []
    };
  }

  return null;
}

function _mapParamTypeToObject(apiFieldType) {
  switch (apiFieldType.toLowerCase()) {
    case 'number':
    case 'int':
    case 'integer':
    case 'float':
      return 0;
    case 'bit':
    case 'bit(0/1)':
      return 0;
    case 'boolean':
    case 'bool':
      return false;
    case 'array':
    case 'int[]':
      return [0, 1];
    case 'date':
    case 'datetime':
      return new Date().toISOString();
    case 'string':
      return 'string';
    case 'string[]':
      return ['string', 'string'];
    case 'object':
      return {
        key: 'value'
      };
    case 'point':
      return {
        Lat: 'value',
        Lng: 'value'
      };
    case 'object[]':
      return [
        {
          key: 'value'
        },
        {
          key: 'value'
        }
      ];
  }
}

function _mapBody(apiItem) {
  if (!['put', 'post', 'patch'].includes(apiItem.type.toLowerCase())) {
    return '';
  }
  // console.log(apiItem)
  if (_.has(apiItem, 'body')) {
    const mappedBody = _.reduce(
      apiItem.body,
      (acc, bodyItem) =>
        _.set(acc, bodyItem.field, _mapParamTypeToObject(bodyItem.type)),
      {}
    );
    return JSON.stringify(mappedBody, undefined, 2);
  }
  return '';
}

function mapQuery(apiItem) {
  if (apiItem?.Parameter) {
    return apiItem.Parameter.map((param) => {
      return {
        key: param.field,
        value: _mapParamTypeToObject(param.type),
        description: escapeHtml(param.description)
      };
    });
  }
  return [];
}

function _apiSorter(apiItem, type) {
  switch (type) {
    case 'name':
      return _nameSorter(apiItem);
    case 'title':
      return _titleSorter(apiItem);
    case 'verbs':
      return _httpVerbSorter(apiItem);
    default:
      return _httpVerbSorter(apiItem);
  }
}

function _httpVerbSorter(apiItem) {
  return HTTP_VERBS.findIndex((verbs) => verbs === apiItem.type.toLowerCase());
}
function _nameSorter(apiItem) {
  return apiItem.name.toLowerCase();
}
function _titleSorter(apiItem) {
  return apiItem.title.toLowerCase();
}

function escapeHtml(description) {
  return description?.replace(/<p>/g, '').replace(/<\/p>/g, '');
}
module.exports = {
  toCollection: toCollection
};
