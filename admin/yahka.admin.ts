/// <reference path="../typings/index.d.ts" />
import * as hkBridge from '../yahka.configuration';
import * as $ from "jquery";

type TIOBrokerAdminChangeCallback = (changeMarker?: boolean) => void;
type TIOBrokerAdminSaveCallback = (settingsObject: any) => void;
function isBridgeConfig(config: hkBridge.Configuration.IBaseConfigNode): config is hkBridge.Configuration.IBridgeConfig {
    if (config === undefined)
        return false;
    return config.configType === "bridge" || (<hkBridge.Configuration.IBridgeConfig>config).ident !== undefined;
}

function isDeviceConfig(config: hkBridge.Configuration.IBaseConfigNode): config is hkBridge.Configuration.IDeviceConfig {
    if (config === undefined)
        return false;
    return config.configType === "customdevice" || (<hkBridge.Configuration.IDeviceConfig>config).services !== undefined;
}

function isIPCameraConfig(config: hkBridge.Configuration.IBaseConfigNode): config is hkBridge.Configuration.ICameraConfig {
    if (config === undefined)
        return false;
    return config.configType === "ipcamera";
}


let defaultCommandLine: hkBridge.Configuration.ICameraFfmpegCommandLine =
    {
        stream: [
            '-re',
            '-i', '${source}',
            '-threads', '0',
            '-vcodec', '${codec}',
            '-an',
            '-pix_fmt', 'yuv420p',
            '-r', '${fps}',
            '-f', 'rawvideo',
            '-tune', 'zerolatency',
            '-vf', 'scale=${width}:${height}',
            '-b:v', '${bitrate}k',
            '-bufsize', '${bitrate}k',
            '-payload_type', '99',
            '-ssrc', '1',
            '-f', 'rtp',
            '-srtp_out_suite', 'AES_CM_128_HMAC_SHA1_80',
            '-srtp_out_params', '${videokey}',
            'srtp://${targetAddress}:${targetVideoPort}?rtcpport=${targetVideoPort}&localrtcpport=${targetVideoPort}&pkt_size=1378'
        ],
        snapshot: [
            '-re',
            '-i', '${source}',
            '-t', '1',
            '-s', '${resolution}',
            '-f', 'image2',
            '-'
        ]
    };
let webcamCommandLine: hkBridge.Configuration.ICameraFfmpegCommandLine = {
    stream: [
        '-re',
        '-f', 'dshow',
        '-i', '${source}',
        '-threads', '0',
        '-vcodec', '${codec}',
        '-an',
        '-pix_fmt', 'yuv420p',
        '-r', '${fps}',
        '-f', 'rawvideo',
        '-tune', 'zerolatency',
        '-vf', 'scale=${width}:${height}',
        '-b:v', '${bitrate}k',
        '-bufsize', '${bitrate}k',
        '-payload_type', '99',
        '-ssrc', '1',
        '-f', 'rtp',
        '-srtp_out_suite', 'AES_CM_128_HMAC_SHA1_80',
        '-srtp_out_params', '${videokey}',
        'srtp://${targetAddress}:${targetVideoPort}?rtcpport=${targetVideoPort}&localrtcpport=${targetVideoPort}&pkt_size=1378'
    ],
    snapshot: [
        '-re',
        '-f', 'dshow',
        '-i', '${source}',
        '-t', '1',
        '-s', '${width}x${height}',
        '-f', 'image2',
        '-'
    ]
}

const ffmpegCommandLines = {
    default: defaultCommandLine,
    webcam: webcamCommandLine
}



interface IDictionary<T> {
    [key: string]: T;
}

interface ISelectListEntry {
    text: string,
    [otherProps: string]: any;
}

declare function getObject(id: string, callback: (error: any, object: any) => void);

declare function translateFragment(fragment: DocumentFragment);

var inoutFunctions: Array<string> = [];
getObject('yahka.meta._inoutFunctions', (error, object) => {
    inoutFunctions = object.native;
});

let convFunctions: Array<string> = [];
getObject('yahka.meta._conversionFunctions', (error, object) => {
    convFunctions = object.native;
});

let HAPServiceDictionary: IDictionary<IHAPServiceDefinition> = {};
getObject('yahka.meta._serviceDictionary', (error, object) => {
    HAPServiceDictionary = object.native;
});

let accessoryCategories: IDictionary<ISelectListEntry> = {};
getObject('yahka.meta._accessoryCategories', (error, object) => {
    accessoryCategories = object.native;
});


interface IConfigPageBuilder {
    refresh(config: hkBridge.Configuration.IBaseConfigNode, AFocusLastPanel: boolean);
    readonly addServiceAvailable: boolean;
    readonly removeDeviceAvailable: boolean;

}

interface IConfigPageBuilderDelegate {
    readonly selectedDeviceConfig: hkBridge.Configuration.IBaseConfigNode;
    readonly bridgeSettings: hkBridge.Configuration.IBridgeConfig;
    cameraConfigs: [hkBridge.Configuration.ICameraConfig];
    setSelectedDeviceConfig(deviceConfig: hkBridge.Configuration.IBaseConfigNode, AFocusLastPanel: boolean)
    refreshDeviceListEntry(deviceConfig: hkBridge.Configuration.IBaseConfigNode, listItem: HTMLElement);
    changeCallback();

    getPageBuilderByConfig(deviceConfig: hkBridge.Configuration.IBaseConfigNode): IConfigPageBuilder;
}


class ioBroker_YahkaAdmin {
    settings: any;

    loadSettings(settingsObject: any, onChangeCallback: TIOBrokerAdminChangeCallback) {
        this.settings = settingsObject;

        new ioBroker_YahkaPageBuilder(this.settings.bridge, this.settings.cameras, onChangeCallback);

        onChangeCallback(false);
    }


    saveSettings(callback: TIOBrokerAdminSaveCallback) {
        callback(this.settings);
    }
}

class ioBroker_YahkaPageBuilder implements IConfigPageBuilderDelegate {
    protected deviceListHandler: ioBroker_DeviceListHandler;
    protected buttonHandler: ioBroker_ButtonHandler;
    protected pageBuilders = new Map<hkBridge.Configuration.TConfigNodeType, IConfigPageBuilder>();
    protected _selectedDeviceConfig: hkBridge.Configuration.IBaseConfigNode = undefined;

    constructor(private _bridgeSettings: hkBridge.Configuration.IBridgeConfig, public cameraConfigs: [hkBridge.Configuration.ICameraConfig], private _changeCallback) {
        if (!_bridgeSettings.devices)
            _bridgeSettings.devices = [];
        _bridgeSettings.configType = 'bridge';

        this.deviceListHandler = new ioBroker_DeviceListHandler(this);
        this.buttonHandler = new ioBroker_ButtonHandler(this, this.deviceListHandler);

        this.pageBuilders.set('bridge', new ConfigPageBuilder_BridgeConfig(this));
        this.pageBuilders.set('customdevice', new ConfigPageBuilder_CustomDevice(this));
        this.pageBuilders.set('ipcamera', new ConfigPageBuilder_IPCamera(this));

        this.bootstrap();
    }

    bootstrap() {
        let bridgeFrame = <HTMLElement>document.querySelector('#yahka_bridge_frame');

        this.deviceListHandler.buildDeviceList(bridgeFrame);
        this.buttonHandler.bindBridgeButtons(bridgeFrame);
        this.buttonHandler.refreshBridgeButtons(bridgeFrame);

        return bridgeFrame;
    }

    public getPageBuilderByConfig(deviceConfig: hkBridge.Configuration.IBaseConfigNode): IConfigPageBuilder {
        if (deviceConfig === undefined) {
            return undefined;
        }

        let configType = deviceConfig.configType;
        if (configType === undefined) {
            if (isBridgeConfig(deviceConfig)) {
                configType = 'bridge';
            } else if (isDeviceConfig(deviceConfig)) {
                configType = 'customdevice';
            }
        }

        return this.pageBuilders.get(configType);
    }

    public get bridgeSettings(): hkBridge.Configuration.IBridgeConfig {
        return this._bridgeSettings;
    }

    public get selectedDeviceConfig(): hkBridge.Configuration.IBaseConfigNode {
        return this._selectedDeviceConfig
    }

    setSelectedDeviceConfig(deviceConfig: hkBridge.Configuration.IBaseConfigNode, AFocusLastPanel: boolean) {
        this._selectedDeviceConfig = deviceConfig;
        let pageBuilder = this.getPageBuilderByConfig(deviceConfig);
        if (pageBuilder) {
            pageBuilder.refresh(deviceConfig, AFocusLastPanel);
        }
        this.buttonHandler.refreshBridgeButtons(document.body);
    }


    public refreshDeviceListEntry(deviceConfig: hkBridge.Configuration.IBaseConfigNode, listItem: HTMLElement) {
        return this.deviceListHandler.refreshDeviceListEntry(deviceConfig, listItem);
    }

    public changeCallback() {
        return this._changeCallback()
    }



}

class ConfigPageBuilder_Base {
    constructor(protected delegate: IConfigPageBuilderDelegate) {
    }
}

class ioBroker_DeviceListHandler extends ConfigPageBuilder_Base {
    deviceListEntryTemplate: HTMLTemplateElement;


    constructor(delegate: IConfigPageBuilderDelegate) {
        super(delegate);
        this.deviceListEntryTemplate = <HTMLTemplateElement>document.querySelector('#yahka_devicelist_entry');
    }


    getDeviceList(): hkBridge.Configuration.IBaseConfigNode[] {
        let result: hkBridge.Configuration.IBaseConfigNode[] = [this.delegate.bridgeSettings];
        if (this.delegate.bridgeSettings.devices)
            result = result.concat(this.delegate.bridgeSettings.devices)
        if (this.delegate.cameraConfigs)
            result = result.concat(this.delegate.cameraConfigs)
        return result;
    }

    createDeviceListEntry(deviceConfig: hkBridge.Configuration.IBaseConfigNode) {
        let deviceEntry = <DocumentFragment>document.importNode(this.deviceListEntryTemplate.content, true);

        let listItem = (<HTMLElement>deviceEntry.querySelector('.list'));
        this.refreshDeviceListEntry(deviceConfig, listItem);
        return deviceEntry;
    }

    buildDeviceList(bridgeFrame: HTMLElement) {
        let bridge = this.delegate.bridgeSettings;
        let deviceList = bridgeFrame.querySelector('#yahka_deviceList');
        deviceList.innerHTML = "";
        for (let deviceConfig of this.getDeviceList())
            deviceList.appendChild(this.createDeviceListEntry(deviceConfig));


        let deviceListClickHandler = this.handleDeviceListClick.bind(this, bridge);
        (<any>$(deviceList)).listview({ onListClick: deviceListClickHandler });
    }

    refreshDeviceListEntry(deviceConfig: hkBridge.Configuration.IBaseConfigNode, listItem: HTMLElement) {
        if (!listItem)
            return;
        let cat: ISelectListEntry;
        let iconClass = "mif-question";
        if (isBridgeConfig(deviceConfig)) {
            iconClass = 'mif-tree';
        } else if ((accessoryCategories !== undefined) && (isDeviceConfig(deviceConfig))) {
            if (cat = accessoryCategories[deviceConfig.category])
                iconClass = cat['icon'];
        } else if (isIPCameraConfig(deviceConfig)) {
            iconClass = 'mif-camera';
        }
        let listIcon = listItem.querySelector('.list-icon');
        listIcon.className = "";
        listIcon.classList.add('list-icon', 'icon', iconClass);

        listItem.querySelector('.list-title').textContent = deviceConfig.name;
        listItem.dataset["deviceIdent"] = deviceConfig.name;
        listItem.classList.toggle('active', (deviceConfig === this.delegate.selectedDeviceConfig));
    }

    findDeviceConfig(bridgeConfig: hkBridge.Configuration.IBridgeConfig, deviceIdent: string): hkBridge.Configuration.IBaseConfigNode {
        if (!bridgeConfig)
            return undefined;
        for (let devConfig of this.getDeviceList())
            if (devConfig.name == deviceIdent)
                return devConfig;
        return undefined;
    }

    handleDeviceListClick(bridgeConfig: hkBridge.Configuration.IBridgeConfig, deviceNode: JQuery) {
        if (!deviceNode)
            return;

        let deviceIdent = deviceNode[0].dataset["deviceIdent"];
        let deviceConfig = this.findDeviceConfig(bridgeConfig, deviceIdent);
        this.delegate.setSelectedDeviceConfig(deviceConfig, false);
    }
}

class ioBroker_ButtonHandler extends ConfigPageBuilder_Base {

    constructor(delegate: IConfigPageBuilderDelegate, protected deviceListHandler: ioBroker_DeviceListHandler) {
        super(delegate);

    }



    bindBridgeButtons(bridgePane: HTMLElement) {
        let bridge = this.delegate.bridgeSettings;
        let elem: HTMLElement;
        if (elem = <HTMLElement>bridgePane.querySelector('#yahka_add_device')) {
            elem.addEventListener('click', (e) => {
                e.preventDefault();
                let newCustomDevice: hkBridge.Configuration.IDeviceConfig = {
                    configType: "customdevice",
                    manufacturer: "",
                    model: "",
                    name: "<new device " + this.deviceListHandler.getDeviceList().length + ">",
                    serial: "",
                    enabled: true,
                    category: 1,
                    services: []
                };
                bridge.devices.push(newCustomDevice);
                this.delegate.setSelectedDeviceConfig(newCustomDevice, true);
                this.deviceListHandler.buildDeviceList(bridgePane);
                this.delegate.changeCallback();
            })
        }

        if (elem = <HTMLElement>bridgePane.querySelector('#yahka_add_camera')) {
            elem.addEventListener('click', (e) => {
                e.preventDefault();
                let newIPCamera: hkBridge.Configuration.ICameraConfig = {
                    configType: "ipcamera",
                    ident: "",
                    manufacturer: "",
                    model: "",
                    name: "<new camera " + this.deviceListHandler.getDeviceList().length + ">",
                    serial: "",
                    port: 0,
                    username: "d8:be:54:e7:06:f6",
                    pincode: "123-45-678",
                    enabled: true,
                    source: "",
                    codec: "libx264",
                    maxWidth: 1920,
                    maxHeight: 1080,
                    maxFPS: 60,
                    verboseLogging: false,
                    numberOfStreams: undefined,
                    ffmpegCommandLine: ffmpegCommandLines.default,
                    devices: []
                };

                this.delegate.cameraConfigs.push(newIPCamera);
                this.delegate.setSelectedDeviceConfig(newIPCamera, true);
                this.deviceListHandler.buildDeviceList(bridgePane);
                this.delegate.changeCallback();
            })
        }


        if (elem = <HTMLElement>bridgePane.querySelector('#yahka_add_service')) {
            elem.addEventListener('click', (e) => {
                e.preventDefault();
                let dev = this.delegate.selectedDeviceConfig;
                if (!isDeviceConfig(dev))
                    return;


                dev.services.push({
                    name: '',
                    subType: '',
                    type: '',
                    characteristics: []
                });
                let pageBuilder = this.delegate.getPageBuilderByConfig(dev);
                if (pageBuilder) {
                    pageBuilder.refresh(dev, true);
                }
                this.delegate.changeCallback();
            });
        }


        if (elem = <HTMLElement>bridgePane.querySelector('#yahka_remove_device')) {
            elem.addEventListener('click', (e) => {
                e.preventDefault();
                let dev = this.delegate.selectedDeviceConfig;
                if (isDeviceConfig(dev)) {
                    let idx = bridge.devices.indexOf(dev);
                    if (idx > -1) {
                        bridge.devices.splice(idx, 1);
                        this.delegate.changeCallback();
                        this.delegate.setSelectedDeviceConfig(undefined, false);
                        this.deviceListHandler.buildDeviceList(bridgePane);
                        this.delegate.changeCallback();
                    }
                } else if (isIPCameraConfig(dev)) {
                    let idx = this.delegate.cameraConfigs.indexOf(dev);
                    if (idx > -1) {
                        this.delegate.cameraConfigs.splice(idx, 1);
                        this.delegate.changeCallback();
                        this.delegate.setSelectedDeviceConfig(undefined, false);
                        this.deviceListHandler.buildDeviceList(bridgePane);
                        this.delegate.changeCallback();
                    }
                }
            });
        }
    }


    refreshBridgeButtons(parent: HTMLElement) {
        // let addDeviceButton    = <HTMLElement>document.querySelector('#yahka_add_device');
        let addServiceButton = <HTMLElement>parent.querySelector('#yahka_add_service');
        let removeDeviceButton = <HTMLElement>parent.querySelector('#yahka_remove_device');

        let pageBuilder = this.delegate.getPageBuilderByConfig(this.delegate.selectedDeviceConfig);
        let addServiceEnabled = pageBuilder ? pageBuilder.addServiceAvailable : false;
        let removeDevEnabled = pageBuilder ? pageBuilder.removeDeviceAvailable : false;

        if (addServiceEnabled)
            addServiceButton.removeAttribute('disabled');
        else
            addServiceButton.setAttribute('disabled', '');

        if (removeDevEnabled)
            removeDeviceButton.removeAttribute('disabled');
        else
            removeDeviceButton.setAttribute('disabled', '');
    }
}

class ConfigPageBuilder_BridgeConfig extends ConfigPageBuilder_Base implements IConfigPageBuilder {
    public addServiceAvailable: boolean = false;
    public removeDeviceAvailable: boolean = false;
    bridgeConfigPanelTemplate: HTMLTemplateElement;
    constructor(protected delegate: IConfigPageBuilderDelegate) {
        super(delegate);
        this.bridgeConfigPanelTemplate = <HTMLTemplateElement>document.querySelector('#yahka_bridgeconfig_template');
    }

    public refresh(config: hkBridge.Configuration.IBaseConfigNode, AFocusLastPanel: boolean) {
        if (!isBridgeConfig(config)) {
            return
        }
        this.refreshBridgeConfigPane(config);
    }

    refreshBridgeConfigPane(bridge: hkBridge.Configuration.IBridgeConfig) {
        let devicePane = <HTMLElement>document.querySelector('#yahka_device_details');
        devicePane.innerHTML = '';

        let bridgeConfigFragment = <DocumentFragment>document.importNode(this.bridgeConfigPanelTemplate.content, true);
        translateFragment(bridgeConfigFragment);


        let inputHelper = (selector: string, propertyName: string) => {
            let input = <HTMLInputElement>bridgeConfigFragment.querySelector(selector);

            let value = bridge[propertyName];
            if (value !== undefined) {
                input.value = value;
            } else {
                input.value = '';
            }
            input.addEventListener("input", this.handleBridgeMetaDataChange.bind(this, bridge, propertyName));
        };

        let checkboxHelper = (selector: string, propertyName: string) => {
            let input = <HTMLInputElement>bridgeConfigFragment.querySelector(selector);

            let value = bridge[propertyName];
            input.checked = value;
            input.addEventListener("click", this.handleBridgeMetaDataChange.bind(this, bridge, propertyName));
        };

        inputHelper('#bridge_name', 'name');
        inputHelper('#bridge_manufacturer', 'manufacturer');
        inputHelper('#bridge_model', 'model');
        inputHelper('#bridge_serial', 'serial');
        inputHelper('#bridge_username', 'username');
        inputHelper('#bridge_pincode', 'pincode');
        inputHelper('#bridge_port', 'port');
        checkboxHelper('#bridge_verboseLogging', 'verboseLogging');

        devicePane.appendChild(bridgeConfigFragment);
    }


    handleBridgeMetaDataChange(bridgeConfig: hkBridge.Configuration.IBridgeConfig, propertyName: string, ev: Event) {
        let inputTarget = <HTMLInputElement>ev.currentTarget;
        let listItem = <HTMLElement>document.querySelector('div.list[data-device-ident="' + bridgeConfig.name + '"]');
        if (inputTarget.type == "checkbox") {
            bridgeConfig[propertyName] = inputTarget.checked;
        } else {
            bridgeConfig[propertyName] = inputTarget.value;
        }
        this.delegate.refreshDeviceListEntry(bridgeConfig, listItem);
        this.delegate.changeCallback();
    }

}



interface IHAPCharacteristicDefintion {
    name: string;
    optional: boolean;
}

interface IHAPServiceDefinition {
    type: string;
    characteristics: IDictionary<IHAPCharacteristicDefintion>;
}

class ConfigPageBuilder_CustomDevice extends ConfigPageBuilder_Base implements IConfigPageBuilder {
    public addServiceAvailable: boolean = true;
    public removeDeviceAvailable: boolean = true;
    deviceInfoPanelTemplate: HTMLTemplateElement;
    deviceServicePanelTemplate: HTMLTemplateElement;
    characteristicRow: HTMLTemplateElement;

    constructor(protected delegate: IConfigPageBuilderDelegate) {
        super(delegate);
        this.deviceInfoPanelTemplate = <HTMLTemplateElement>document.querySelector('#yahka_device_info_panel_template');
        this.deviceServicePanelTemplate = <HTMLTemplateElement>document.querySelector('#yahka_device_service_panel');
        this.characteristicRow = <HTMLTemplateElement>document.querySelector('#yahka_characteristic_row');
    }

    public refresh(config: hkBridge.Configuration.IBaseConfigNode, AFocusLastPanel: boolean) {
        if (!isDeviceConfig(config)) {
            return
        }
        this.refreshDevicePane(config, AFocusLastPanel);
    }

    refreshDevicePane(deviceConfig: hkBridge.Configuration.IDeviceConfig, focusLast?: boolean) {
        let devicePane = <HTMLElement>document.querySelector('#yahka_device_details');
        devicePane.innerHTML = '';

        if (deviceConfig === undefined)
            return;

        let lastPane: HTMLElement = this.buildDeviceInformationPanel(deviceConfig, devicePane);
        for (let serviceConfig of deviceConfig.services) {
            let servicePanel = this.createServicePanel(deviceConfig, serviceConfig);
            devicePane.appendChild(servicePanel);
            lastPane = servicePanel;
        }

        if (focusLast && lastPane) {
            lastPane.scrollIntoView();
            if (!lastPane.classList.contains('active')) {
                let heading = (<HTMLElement>lastPane.querySelector('.heading'));
                if (heading)
                    heading.click();
            }
        }
    }

    buildDeviceInformationPanel(deviceConfig: hkBridge.Configuration.IDeviceConfig, devicePane: HTMLElement): HTMLElement {
        let devInfoFragment = <DocumentFragment>document.importNode(this.deviceInfoPanelTemplate.content, true);
        let devInfoPanel = <HTMLElement>devInfoFragment.querySelector('#yahka_device_info_panel');
        translateFragment(devInfoFragment);

        let inputHelper = (selector: string, propertyName: string, selectList?: IDictionary<ISelectListEntry>) => {
            let input = <HTMLSelectElement>devInfoPanel.querySelector(selector);

            if (selectList) {
                this.fillSelectByDict(input, selectList);
            }

            let value = deviceConfig[propertyName];
            if (input.type === 'checkbox') {
                input.checked = value === undefined ? true : value;
                input.addEventListener('change', this.handleDeviceMetaDataChange.bind(this, deviceConfig, propertyName))
            } else {
                if (value !== undefined) {
                    input.value = value;
                } else {
                    input.value = '';
                }
                input.addEventListener('input', this.handleDeviceMetaDataChange.bind(this, deviceConfig, propertyName));
            }
        };

        inputHelper('#device_name', 'name');
        inputHelper('#device_enabled', 'enabled');
        inputHelper('#device_manufacturer', 'manufacturer');
        inputHelper('#device_model', 'model');
        inputHelper('#device_serial', 'serial');
        inputHelper('#device_category', 'category', accessoryCategories);

        devicePane.appendChild(devInfoFragment);
        return devInfoPanel;
    }

    createServicePanel(deviceConfig: hkBridge.Configuration.IDeviceConfig, serviceConfig: hkBridge.Configuration.IServiceConfig): HTMLElement {
        let servicePanel = <DocumentFragment>document.importNode(this.deviceServicePanelTemplate.content, true);
        let frameNode = <HTMLElement>servicePanel.querySelector('#yahka_service_panel');
        translateFragment(servicePanel);
        let inputHelper = (selector: string, configName: string, popuplateServices?: boolean, eventHandler?) => {
            let input = <HTMLSelectElement>frameNode.querySelector(selector);
            if (popuplateServices === true) {
                let selectList: string[] = Object.keys(HAPServiceDictionary);
                this.fillSelectByArray(input, selectList);
            }

            if (serviceConfig) {
                let value = serviceConfig[configName];
                if (value !== undefined) {
                    input.value = value;
                } else {
                    input.value = '';
                }
            }

            if (eventHandler !== undefined)
                input.addEventListener('input', eventHandler);
            else
                input.addEventListener('input', this.handleServiceMetaDataChange.bind(this, serviceConfig, frameNode, configName));
        };

        this.refreshServicePanelCaption(serviceConfig, frameNode);
        inputHelper('#service_name', 'name');
        inputHelper('#service_type', 'type', true, this.handleServiceTypeChange.bind(this, serviceConfig, frameNode));
        inputHelper('#service_subtype', 'subType');

        this.buildCharacteristicTable(serviceConfig, frameNode);

        // bind delete buttton
        frameNode.querySelector('#yakha_delete_service').addEventListener('click', () => {
            let idx = deviceConfig.services.indexOf(serviceConfig);
            if (idx > -1) {
                deviceConfig.services.splice(idx, 1);
                this.delegate.changeCallback();
                frameNode.parentNode.removeChild(frameNode);
            }
        });

        return frameNode;
    }

    refreshServicePanelCaption(serviceConfig: hkBridge.Configuration.IServiceConfig, servicePanel: HTMLElement) {
        servicePanel.querySelector('#yahka_service_caption').textContent = serviceConfig.name + '[' + serviceConfig.type + ']';
    }

    findHAPCharacteristic(serviceDef: IHAPServiceDefinition, characteristicName: string): IHAPCharacteristicDefintion {
        if (!serviceDef)
            return undefined;
        let x;
        if (x = serviceDef.characteristics[characteristicName])
            return x;
        return undefined;
    }

    findConfigCharacteristic(service: hkBridge.Configuration.IServiceConfig, characteristicName: string): hkBridge.Configuration.ICharacteristicConfig {
        if (!service) {
            return undefined;
        }

        for (let cfg of service.characteristics) {
            if (cfg.name == characteristicName) {
                return cfg;
            }
        }

        return undefined;
    }

    isEmptyCharacteristic(charConfig: hkBridge.Configuration.ICharacteristicConfig): boolean {
        if (charConfig === undefined)
            return true;
        if (charConfig.name === '')
            return true;


        if ((charConfig['inOutFunction'] === '') || (charConfig['inOutFunction'] === undefined))
            return true;

        return false;
    }

    removeCharacteristic(serviceConfig: hkBridge.Configuration.IServiceConfig, charConfig: hkBridge.Configuration.ICharacteristicConfig) {
        if (serviceConfig === undefined) {
            return;
        }

        let idx = serviceConfig.characteristics.indexOf(charConfig);
        if (idx > -1) {
            serviceConfig.characteristics.splice(idx, 1);
            this.delegate.changeCallback();
        }
    }

    buildCharacteristicTable(serviceConfig: hkBridge.Configuration.IServiceConfig, servicePanel: HTMLElement) {
        let serviceDef = HAPServiceDictionary[serviceConfig.type];
        let createdCharacteristics: IDictionary<[string, boolean, DocumentFragment]> = {};
        for (let charConfig of serviceConfig.characteristics) {
            let charDef = this.findHAPCharacteristic(serviceDef, charConfig.name);
            if ((charDef === undefined) && (this.isEmptyCharacteristic(charConfig))) {
                this.removeCharacteristic(serviceConfig, charConfig);
                continue;
            }
            let charRow = this.createCharacteristicRow(charDef, serviceConfig, charConfig);
            createdCharacteristics[charConfig.name] = [charConfig.name, charDef ? charDef.optional : false, charRow];
        }

        // add undefined characteristics
        if (serviceDef) {
            for (let charName in serviceDef.characteristics) {
                if (createdCharacteristics[charName] === undefined) {
                    let charDef = serviceDef.characteristics[charName];
                    let charRow = this.createCharacteristicRow(charDef, serviceConfig, undefined);
                    createdCharacteristics[charName] = [charName, charDef.optional, charRow];
                }
            }
        }

        let charRows: Array<[string, boolean, DocumentFragment]> = [];

        for (let charRow in createdCharacteristics)
            charRows.push(createdCharacteristics[charRow]);

        charRows.sort((a, b) => {
            if (a[1] != b[1])
                return a[1] ? -1 : 1;
            return a[0].localeCompare(b[0]);
        });

        let table = servicePanel.querySelector('#yahka_characteristic_table');
        while (table.childElementCount > 1) {// first row is the header row
            table.removeChild(table.lastElementChild);
        }
        for (let row of charRows) {
            table.appendChild(row[2]);
        }
    }

    createCharacteristicRow(charDef: IHAPCharacteristicDefintion, serviceConfig: hkBridge.Configuration.IServiceConfig, charConfig: hkBridge.Configuration.ICharacteristicConfig): DocumentFragment {
        let name = charConfig ? charConfig.name : charDef.name;
        let enabled = charConfig ? charConfig.enabled : false;

        let rowElement = <DocumentFragment>document.importNode(this.characteristicRow.content, true);

        translateFragment(rowElement);

        let bracketElement = <HTMLElement>rowElement.querySelector('#characteristic');

        let checkBox = <HTMLInputElement>rowElement.querySelector('#characteristic_enabled');
        checkBox.checked = enabled;
        checkBox.addEventListener('click', this.handleCharacteristicEnabledChange.bind(this, serviceConfig, name, bracketElement))

        this.refreshEnabledClass(bracketElement, enabled);
        this.refershOptionalClass(bracketElement, charDef ? charDef.optional : true);

        rowElement.querySelector('#characteristic_name').textContent = name;


        let inputHelper = (selector: string, configName: string, selectList: string[]) => {
            let input = <HTMLSelectElement>rowElement.querySelector(selector);
            if (selectList !== undefined)
                this.fillSelectByArray(input, selectList);
            if (charConfig) {
                let value = charConfig[configName];
                if (value !== undefined)
                    input.value = value;
                else
                    input.value = "";
            }
            input.addEventListener('input', this.handleCharacteristicInputChange.bind(this, serviceConfig, name, configName));
        };

        inputHelper('#characteristic_inoutfunction', 'inOutFunction', inoutFunctions);
        inputHelper('#characteristic_inoutparams', 'inOutParameters', undefined);
        inputHelper('#characteristic_conversionfunction', 'conversionFunction', convFunctions);
        inputHelper('#characteristic_conversionparams', 'conversionParameters', undefined);

        return rowElement;
    }

    fillSelectByArray(inoutSelect: HTMLSelectElement, stringlist: string[]) {
        for (let itemName of stringlist) {
            let optElem = document.createElement('option');
            optElem.value = itemName;
            optElem.text = itemName;
            inoutSelect.add(optElem);
        }
    }


    fillSelectByDict(inoutSelect: HTMLSelectElement, dictionary: IDictionary<ISelectListEntry>) {
        for (let key in dictionary) {
            let optElem = document.createElement('option');
            optElem.value = key;
            optElem.text = dictionary[key].text;
            inoutSelect.add(optElem);
        }
    }


    refreshEnabledClass(row: HTMLElement, enabled: boolean) {
        row.classList.toggle('disabled', !enabled);
    }

    refershOptionalClass(row: HTMLElement, optional: boolean) {
        row.classList.toggle('optional-characteristic', optional);
    }

    handleCharacteristicEnabledChange(serviceConfig: hkBridge.Configuration.IServiceConfig, charName: string, charRow: HTMLElement, ev: Event) {
        let charConfig = this.findConfigCharacteristic(serviceConfig, charName);
        if (charConfig === undefined) {
            charConfig = { name: charName, enabled: false }
            serviceConfig.characteristics.push(charConfig);
        }
        let inputTarget = <HTMLInputElement>ev.currentTarget;
        charConfig.enabled = inputTarget.checked;

        this.refreshEnabledClass(charRow, charConfig.enabled);

        this.delegate.changeCallback();
    }

    handleCharacteristicInputChange(serviceConfig: hkBridge.Configuration.IServiceConfig, charName: string, attribute: string, ev: Event) {
        let charConfig = this.findConfigCharacteristic(serviceConfig, charName);
        if (charConfig === undefined) {
            charConfig = { name: charName, enabled: false }
            serviceConfig.characteristics.push(charConfig);
        }

        let inputTarget = <HTMLInputElement>ev.currentTarget;
        let inputValue = inputTarget.value;
        charConfig[attribute] = inputValue;

        this.delegate.changeCallback();
    }



    handleDeviceMetaDataChange(deviceConfig: hkBridge.Configuration.IDeviceConfig, propertyName: string, ev: Event) {
        let inputTarget = <HTMLInputElement>ev.currentTarget;
        let inputValue = (inputTarget.type === 'checkbox') ? inputTarget.checked : inputTarget.value;
        let listItem = <HTMLElement>document.querySelector('div.list[data-device-ident="' + deviceConfig.name + '"]');
        deviceConfig[propertyName] = inputValue;
        this.delegate.refreshDeviceListEntry(deviceConfig, listItem);
        this.delegate.changeCallback();
    }

    handleServiceMetaDataChange(serviceConfig: hkBridge.Configuration.IServiceConfig, servicePanel: HTMLElement, attribute: string, ev: Event) {
        let inputTarget = <HTMLInputElement>ev.currentTarget;
        let inputValue = inputTarget.value;
        serviceConfig[attribute] = inputValue;

        this.refreshServicePanelCaption(serviceConfig, servicePanel);

        this.delegate.changeCallback();
    }


    handleServiceTypeChange(serviceConfig: hkBridge.Configuration.IServiceConfig, servicePanel: HTMLElement, ev: Event) {
        let inputTarget = <HTMLInputElement>ev.currentTarget;
        let inputValue = inputTarget.value;
        serviceConfig.type = inputValue;

        this.refreshServicePanelCaption(serviceConfig, servicePanel);

        this.buildCharacteristicTable(serviceConfig, servicePanel);

        this.delegate.changeCallback();
    }
}


class ConfigPageBuilder_IPCamera extends ConfigPageBuilder_Base implements IConfigPageBuilder {
    public addServiceAvailable: boolean = false;
    public removeDeviceAvailable: boolean = true;

    configPanelTemplate: HTMLTemplateElement;
    constructor(protected delegate: IConfigPageBuilderDelegate) {
        super(delegate);
        this.configPanelTemplate = <HTMLTemplateElement>document.querySelector('#yahka_cameraConfig_template');
    }

    public refresh(config: hkBridge.Configuration.IBaseConfigNode, AFocusLastPanel: boolean) {
        if (!isIPCameraConfig(config)) {
            return
        }
        this.refreshConfigPane(config);
    }

    refreshConfigPane(config: hkBridge.Configuration.ICameraConfig) {
        let devicePane = <HTMLElement>document.querySelector('#yahka_device_details');
        devicePane.innerHTML = '';

        let configFragment = <DocumentFragment>document.importNode(this.configPanelTemplate.content, true);
        translateFragment(configFragment);

        let inputHelper = (selector: string, propertyName: keyof hkBridge.Configuration.ICameraConfig) => {
            let input = <HTMLSelectElement>configFragment.querySelector(selector);

            let value = config[propertyName];
            if (input.type === 'checkbox') {
                input.checked = value === undefined ? true : value;
                input.addEventListener('change', this.handlePropertyChange.bind(this, config, propertyName))
            } else {
                if (value !== undefined) {
                    input.value = value.toString();
                } else {
                    input.value = '';
                }
                input.addEventListener('input', this.handlePropertyChange.bind(this, config, propertyName));
            }
        };   
        
        let ffmpegHelper = (selector: string, propertyName: keyof hkBridge.Configuration.ICameraFfmpegCommandLine) => {
            let input = <HTMLSelectElement>configFragment.querySelector(selector);

            let value = config.ffmpegCommandLine[propertyName];
            if (value !== undefined) {
                input.value = JSON.stringify(value, null, 2);
            } else {
                input.value = '';
            }
            input.addEventListener('input', this.handleffMpegPropertyChange.bind(this, config, propertyName));
            
        };           

        inputHelper('#camera_enabled', 'enabled');
        inputHelper('#camera_name', 'name');
        inputHelper('#camera_manufacturer', 'manufacturer');
        inputHelper('#camera_model', 'model');
        inputHelper('#camera_serial', 'serial');
        inputHelper('#camera_username', 'username');
        inputHelper('#camera_pincode', 'pincode');
        inputHelper('#camera_port', 'port');


        inputHelper('#camera_source', 'source');
        inputHelper('#camera_codec', 'codec');
        inputHelper('#camera_numberOfStreams', 'numberOfStreams');
        inputHelper('#camera_maxWidth', 'maxWidth');
        inputHelper('#camera_maxHeight', 'maxHeight');
        inputHelper('#camera_maxFPS', 'maxFPS');

        ffmpegHelper('#ffmpeg_snapshot', 'snapshot');
        ffmpegHelper('#ffmpeg_stream', 'stream');

        devicePane.appendChild(configFragment);
    }


    handlePropertyChange(config: hkBridge.Configuration.ICameraConfig, propertyName: keyof hkBridge.Configuration.ICameraConfig, ev: Event) {
        let inputTarget = <HTMLInputElement>ev.currentTarget;
        let listItem = <HTMLElement>document.querySelector('div.list[data-device-ident="' + config.name + '"]');
        if (inputTarget.type == "checkbox") {
            config[propertyName] = inputTarget.checked;
        } else {
            config[propertyName] = inputTarget.value;
        }
        this.delegate.refreshDeviceListEntry(config, listItem);
        this.delegate.changeCallback();
    }



    handleffMpegPropertyChange(config: hkBridge.Configuration.ICameraConfig, propertyName: keyof hkBridge.Configuration.ICameraFfmpegCommandLine, ev: Event) {
        let inputTarget = <HTMLInputElement>ev.currentTarget;
        let listItem = <HTMLElement>document.querySelector('div.list[data-device-ident="' + config.name + '"]');
        try {
            config.ffmpegCommandLine[propertyName] = JSON.parse(inputTarget.value);
        } catch {
            // TODO
        }
        this.delegate.refreshDeviceListEntry(config, listItem);
        this.delegate.changeCallback();
    }    
}