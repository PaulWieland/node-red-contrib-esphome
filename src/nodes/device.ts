import {NodeAPI} from 'node-red';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {Client} = require('@2colors/esphome-native-api');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Package = require('../../package.json');
import {LogLevel} from '../lib/utils';

module.exports = (RED: NodeAPI) => {
  RED.nodes.registerType(
    'esphome-device',
    function (this: any, config: any) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      self.config = config;

      RED.nodes.createNode(this, config);

      self.setMaxListeners(0);
      self.device = {};
      self.entities = [];
      self.current_status = 'disconnected';
      self.logger = parseInt(self.config?.loglevel);
      self.ble = Boolean(self.config?.ble);

      if (!self.config?.host || !self.config?.port) {
        return;
      }

      self.onStatus = function (string: string) {
        self.current_status = string;
        self.emit('onStatus', string);
      };

      self.onState = function (object: any) {
        self.emit('onState', object);
      };

      self.onBle = function (object: any) {
        self.emit('onBle', object);
      };

      let options: any = {
        host: self.config.host,
        port: self.config.port,
        password: self.credentials.password,
        clientInfo: Package.name + ' ' + Package.version,
        initializeDeviceInfo: true,
        initializeListEntities: true,
        initializeSubscribeStates: true,
        reconnect: true,
        reconnectInterval: 15 * 1000,
        pingInterval: 15 * 1000,
        initializeSubscribeBLEAdvertisements: self.ble
      };

      if (self.logger) {
        options = {
          ...options,
          initializeSubscribeLogs: {
            level: self.config.loglevel,
            dumpConfig: self.config.logdump
          }
        };
      }

      self.client = new Client(options);

      try {
        self.client.connect();
        self.client.connection.setMaxListeners(0);
      } catch (e: any) {
        self.error(e.message);
        return;
      }

      self.client.on('error', (e: Error) => {
        if (e.message.includes('EHOSTUNREACH')) {
          /* empty */
        } else if (e.message.includes('Invalid password')) {
          /* empty */
        } else if (e.message.includes('ECONNRESET')) {
          /* empty */
        } else if (e.message.includes('TIMEOUT')) {
          /* empty */
        } else if (e.message.includes('write after end')) {
          /* empty */
        } else {
          // copy this error to issues ...
        }
        self.error(e.message);
        self.onStatus('error');
      });

      self.client.on('disconnected', () => {
        self.onStatus('disconnected');
      });

      self.client.on('connected', () => {
        // clear entities
        self.entities = [];
        // logs to entities
        if (self.logger) {
          self.entities.push({
            key: 'logs',
            type: 'Systems',
            name: 'Logs',
            config: {
              deviceClass: LogLevel[self.config.loglevel]
            }
          });
        }
        // ble to entities
        if (self.ble) {
          self.entities.push({
            key: 'ble',
            type: 'Systems',
            name: 'BLE'
          });
        }

        self.onStatus('connecting');
      });

      self.client.on('initialized', () => {
        self.onStatus('connected');
      });

      self.client.on('deviceInfo', (deviceInfo: any) => {
        self.device = deviceInfo;
      });

      self.client.on('newEntity', (entity: any) => {
        self.entities.push({
          key: entity.id,
          type: entity.type,
          name: entity.name,
          config: entity.config
        });

        entity.on('state', (state: any) => {
          self.onState({...state});
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        entity.on('error', (e: Error) => {
          /* empty */
        });
      });

      // logs
      self.client.on('logs', (payload: any) => {
        self.onState({key: 'logs', ...payload});
      });

      // ble
      self.client.on('ble', (payload: any) => {
        self.onBle({key: 'ble', ...payload});
      });

      self.on('close', () => {
        self.client.disconnect();
      });
    },
    {
      credentials: {
        password: {type: 'password'}
      }
    }
  );
};
