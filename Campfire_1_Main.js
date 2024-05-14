/********************************************************
Copyright (c) 2023 Cisco and/or its affiliates.
This software is licensed to you under the terms of the Cisco Sample
Code License, Version 1.1 (the "License"). You may obtain a copy of the
License at
               https://developer.cisco.com/docs/licenses
All use of the material herein must be in accordance with the terms of
the License. All rights not expressly granted by the License are
reserved. Unless required by applicable law or agreed to separately in
writing, software distributed under the License is distributed on an "AS
IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
or implied.
*********************************************************
*
*/

/********************************
            Imports
********************************/
import xapi from 'xapi';
import { Settings, CodecInfo, AudioMap } from './Campfire_2_Config';
import { Run_Setup, SendToNodes } from './Campfire_3_Initialization';
import { Text } from './Campfire_5_TextLocalization';
import { GMM } from './GMM_Lite_Lib';
import { AZM } from './AZM_Lib';

/********************************
          Prototypes
********************************/

// Alternative Includes prototype that replaces the Strict Equality operator (===) with theEquality Operator (==)
Array.prototype.includish = function (value) {
  for (let i = 0; i < this.length; i++) {
    if (this[i] == value) {
      return true;
    }
  }
  return false;
};


// Enables a Clean Cloning of an Object without altering the original object
Object.prototype.clone = Array.prototype.clone = function () {
  if (Object.prototype.toString.call(this) === '[object Array]') {
    var clone = [];
    for (var i = 0; i < this.length; i++) {
      clone[i] = this[i].clone();
    }
    return clone;
  } else if (typeof (this) == "object") {
    var clone = {};
    for (var prop in this)
      if (this.hasOwnProperty(prop)) {
        clone[prop] = this[prop].clone();
      }
    return clone;
  } else {
    return this;
  }
}

//Performs a soft check to see if the incoming data is a string before evaluating
String.prototype.safeToLowerCase = function () {
  if (this && typeof this === 'string') {
    return this.toLowerCase();
  } else {
    return this; // Return the original value if it's not a valid string
  }
};

/********************************
        Class Definitions
********************************/

//Instatiates an array, that handles the adding and removing of objects in it's index
//Used to alter the array passed into SetMainSurce for PeopleCount and Conversation based compositions
class CameraCompositionTracker {
  constructor(startingComposition, defaultComposition, label, protectedIds) {
    this.StartingComposition = startingComposition.map(element => parseInt(element));
    this.DefaultComposition = defaultComposition.map(element => parseInt(element));
    this.CurrentComposition = startingComposition.map(element => parseInt(element));
    this.Label = label;
    this.ProtectedCameraIds = protectedIds.map(element => parseInt(element));
  }
  addCamera(cameraId) {
    if (this.ProtectedCameraIds.includes(cameraId)) {
      console.warn({ Campfire_1_Warn: `CameraId [${cameraId}] is protected in the [${this.Label}] composition and can not be added programatically` })
      return this.CurrentComposition;
    }
    this.CurrentComposition.push(parseInt(cameraId))
    this.CurrentComposition = [...new Set(this.CurrentComposition)];
    this.CurrentComposition = this.CurrentComposition.sort(function (a, b) { return a - b; });
    console.log({ Campfire_1_Log: `Composition [${this.Label}] Updated`, Action: `Adding Camera [${cameraId}]`, Composition: prettyCompositionLog_nodeInfo(this.CurrentComposition) })
    this.CurrentComposition.splice(4)
    return this.CurrentComposition;
  }
  removeCamera(cameraId) {
    if (this.ProtectedCameraIds.includes(cameraId)) {
      console.warn({ Campfire_1_Warn: `CameraId [${cameraId}] is protected in the [${this.Label}] composition and can not be removed programatically` })
      return this.CurrentComposition;
    }
    const index = this.CurrentComposition.indexOf(parseInt(cameraId));
    if (index !== -1) {
      this.CurrentComposition.splice(index, 1);
      if (this.CurrentComposition.length < 1) {
        console.warn({ Campfire_1_Warn: `Composition [${this.Label}] Empty!` })
      }
      this.CurrentComposition = [...new Set(this.CurrentComposition)];
      this.CurrentComposition = this.CurrentComposition.sort(function (a, b) { return a - b; });
      console.log({ Campfire_1_Log: `Composition [${this.Label}] Updated`, Action: `Removing Camera [${cameraId}]`, Composition: prettyCompositionLog_nodeInfo(this.CurrentComposition) })
      this.CurrentComposition.splice(4)
      return this.CurrentComposition;
    } else {
      console.log({ Campfire_1_Log: `Composition [${this.Label}] Updated`, Action: 'No Action', Composition: prettyCompositionLog_nodeInfo(this.CurrentComposition) })
      this.CurrentComposition.splice(4)
      return this.CurrentComposition;
    }
  }
  shiftToFront(cameraId) {
    const index = this.CurrentComposition.indexOf(cameraId);
    if (index !== -1) {
      this.CurrentComposition.splice(index, 1);
      this.CurrentComposition.unshift(cameraId);
    }
    return this.CurrentComposition;
  }
  reset() {
    console.debug({ Campfire_1_Debug: `Composition [${this.Label}] Reset` })
    this.CurrentComposition = this.DefaultComposition.clone();
    return this
  }
  get() {
    return this.CurrentComposition;
  }
}

/********************************
          Const/Var/Let
********************************/

//Test that shows when a specific camera mode is selected
const cameraModeDescriptions = {
  Speaker: 'Maintain focus on the active speaker in your room, so your audience doesn\'t lose sight of them',
  Everyone: 'Promote Equity in your space, leveraging all 4 cameras and Frames Camera Intelligence',
  Conversation: 'Keep the conversations alive, by mixing all cameras with a closeup of each active speaker',
  Side_By_Side: 'Mix the Active Speakers into view, framing all others near them'
}

//Default PTZ Position for all Quadcameras when someone actively mutes a the room
const mutedOverviewPTZPosition = Settings.Camera.MutedOverview.Position.clone()

// Used to track and implement the Active Campfire Camera mode
let activeCameraMode = '';

// Used to track for changes in Camera mode selection
let previousCameraMode = Settings.Camera.DefaultMode.clone();

let previousPTZCameraMode = Settings.Camera.PresenterDetector.DefaultCameraMode.toLowerCase() == 'auto' ? 'Presenter' : Settings.Camera.PresenterDetector.DefaultCameraMode.clone()

let previousQuadcameraMode = Settings.Camera.DefaultMode.clone();



// Used to track the currentCamera Composition
let currentComposition = [];

// Used to track the last known Camera Composition, primarily used to prevent excessive SetMainSource Changes
let lastknownComposition = [];

// Data about the Node Codecs, used for logging and updating node Information
let nodeInfo = [];

// Initialize the array used to track the PeopleCount composition
const peopleDataComposition = new CameraCompositionTracker([], [1, 2, 3, 4], 'PeopleCount', []);

// Initialize the array used to track the Conversation composition
const conversationComposition = new CameraCompositionTracker([], [1, 2, 3, 4], 'Conversation', []);

// Initialize the array used to track the Conversation composition
let questionAndAnswerComposition = '';

// Used to check the last known audio zone trigger in Camera Mode Speaker, helps clean up logs
let lastknownSpeaker_ZoneId = 0;

//Used to check if Speakertracking is available on this codec
let spkState = '';

//Used to check if Presentertracking is available on this codec
let pstState = '';

/********************************
      Initialization Function
********************************/

async function init() {
  console.warn({ Campfire_1_Warn: `Initializing Campfire Blueprint...` })

  await AZM.Command.Zone.Setup(AudioMap);
  await Run_Setup();

  // Get Codec's Serial
  let thisSerial = await xapi.Status.SystemUnit.Hardware.Module.SerialNumber.get()

  // Get current Mute Status
  let muteStatus = await xapi.Status.Audio.Microphones.Mute.get();

  //Check for active video, then start VuMeter when appropriate
  const isOnCall = (await xapi.Status.Call.get()) == '' ? false : true;
  const isStreaming = await checkUSBPassthroughState();
  const isSelfViewOn = (await xapi.Status.Video.Selfview.Mode.get()) == 'On' ? true : false;
  const isSelfviewFull = (await xapi.Status.Video.Selfview.FullscreenMode.get()) == 'On' ? true : false;

  let standbyState = (await xapi.Status.Standby.State.get()) == 'Standby' ? 'Standby' : 'Off';

  spkState = (await xapi.Status.Cameras.SpeakerTrack.Availability.get()) == 'Available' ? true : false;
  pstState = (await xapi.Status.Cameras.PresenterTrack.Availability.get()) == 'Available' ? true : false;

  mutedOverviewPTZPosition.CameraId = await findPrimaryQuadCameraId();

  await configurePresetnerTrack(pstState);

  nodeInfo = CodecInfo.NodeCodecs.clone();

  nodeInfo.forEach((e, i) => { delete nodeInfo[i].IpAddress; delete nodeInfo[i].Authentication });
  //If a 4 Codec Design, add the Primary Codec to the nodeInfo
  if (CodecInfo.PrimaryCodec.PrimaryCodec_QuadCamera_ConnectorId > 0 && spkState) {
    nodeInfo.unshift(CodecInfo.PrimaryCodec.clone());
    nodeInfo.forEach((e, i) => { delete nodeInfo[i].IpAddress; delete nodeInfo[i].Authentication });
  }

  if (spkState) {
    Subscribe.PeopleCountCurrent = async function () {
      if (Settings.Camera.DefaultOverview.Mode.safeToLowerCase() == 'auto') {
        let currentPeople = await xapi.Status.RoomAnalytics.PeopleCount.Current.get()
        if (currentPeople <= 0) {
          peopleDataComposition.removeCamera(CodecInfo.PrimaryCodec.PrimaryCodec_QuadCamera_ConnectorId);
        } else {
          peopleDataComposition.addCamera(CodecInfo.PrimaryCodec.PrimaryCodec_QuadCamera_ConnectorId);
        }
      }
      xapi.Status.RoomAnalytics.PeopleCount.Current.on(Handle.Status.PeopleCountCurrent);
    }
  }

  await StartSubscriptions();

  if (Settings.UserInterface.Visibility.CampfireControls.toLowerCase() == 'hidden') {
    console.debug({ Campfire_1_Debug: `Campfire Panel hidden away` })
    xapi.Command.UserInterface.Extensions.Panel.Update({ PanelId: 'CampfireBlueprint~Visible', Visibility: 'Hidden' })
    xapi.Command.UserInterface.Extensions.Panel.Close();
  } else {
    xapi.Command.UserInterface.Extensions.Panel.Update({ PanelId: 'CampfireBlueprint~Visible', Visibility: 'Auto' })
  }

  //Recover Camera Mode
  try {
    activeCameraMode = await GMM.read('activeCameraMode');
  } catch (e) {
    Handle.Error(e, 'GMM.read', 172)
    updateCameraMode(Settings.Camera.DefaultMode, 'Camera Recovery Failed')
  }

  try {
    previousPTZCameraMode = await GMM.read('previousPTZCameraMode');
  } catch (e) {
    Handle.Error(e, 'GMM.read', 172)
    previousPTZCameraMode = 'Presenter';
    GMM.write('previousPTZCameraMode', previousPTZCameraMode)
  }

  console.log({ Campfire_1_Info: `Camera Mode Recovered from Memory: [${activeCameraMode}]` })

  //Re-apply camera mode on macro startup
  if (muteStatus == 'Off' && isOnCall) {
    await updateCameraMode(activeCameraMode, 'Initialized On Call');
  } else if (muteStatus == 'Off' && !isOnCall) {
    if (activeCameraMode == 'Presenter' || activeCameraMode == 'QuestionAndAnswer') {
      let currentPresenterState = (await xapi.Status.Cameras.PresenterTrack.PresenterDetected.get()) == 'True' ? true : false;
      if (!currentPresenterState) {
        activeCameraMode = Settings.Camera.DefaultMode;
      }
    };
    await updateCameraMode(activeCameraMode, 'Init');
  } else {
    await runMuteState();
  };

  //Check Node Connection
  const initializeNodes = await SendToNodes('Initialization', btoa(JSON.stringify({
    IpAddress: await xapi.Status.Network[1].IPv4.Address.get(),
    Authentication: CodecInfo.PrimaryCodec.Authentication,
    CameraMode: activeCameraMode,
    RollAssignment: nodeInfo,
    StandbyStatus: standbyState,
    MutedPTZ: mutedOverviewPTZPosition
  })))

  //console.log(initializeNodes)

  if (initializeNodes.Errors.length > 0) {
    initializeNodes.Errors.forEach(element => {
      xapi.Command.UserInterface.Message.Alert.Display({ Title: `⚠️ Campfire Macro Error ⚠️`, Text: `Please review the [${_main_macro_name()}] Macro for more details` })
      throw new Error({
        Campfire_1_Error: `Failed to initialize node on macro startup`,
        Response: { Destination: element.GMM_Context.Destination, Message: element?.message, StatusCode: element.data?.StatusCode }
      })
    })
  }

  //Assemble Signin Banner Message
  let nodeBannerMessage = ``;

  let primaryLabel = '';
  let signinBannerArray = nodeInfo.clone();

  // Find the length of the longest string in the 'Label' category
  let maxLengthLabel = Math.max(...signinBannerArray.map(el => el.Label.length));

  // Find the length of the longest string in the 'PrimaryCodec_QuadCamera_ConnectorId' category
  let maxLengthPrimaryCodec = Math.max(...signinBannerArray.map(el => el.PrimaryCodec_QuadCamera_ConnectorId.length));

  signinBannerArray.forEach((el, i) => {
    let paddedLabel = el.Label.padStart(maxLengthLabel, ' ');
    let paddedPrimaryCodec = el.PrimaryCodec_QuadCamera_ConnectorId.padEnd(maxLengthPrimaryCodec, ' ');

    if (el.CodecSerialNumber != thisSerial) {
      nodeBannerMessage += `  - Label: [${paddedLabel}] || Serial: [${el.CodecSerialNumber}] || VideoInput: [${paddedPrimaryCodec}]${i + 1 != signinBannerArray.length ? '\n' : ''}`;
    } else {
      primaryLabel = el.Label;
    }
  });

  // Set primary Signin Banner Message
  await xapi.Command.SystemUnit.SignInBanner.Clear().catch(e => Handle.Error(e, 'SignInBanner.Clear', 202));
  await xapi.Command.SystemUnit.SignInBanner.Set({}, `Campfire Blueprint Primary Macros Installed
  - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  To configure the Campfire Blueprint, Edit the [Campfire_2_Config] Macro

  SystemRole: [Primary Codec] || Label: [${primaryLabel}]
  - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  Connected Node Codecs:\n${nodeBannerMessage}
  - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  Should you need support, contact IT/Device Admin or Vendor Partner
  https://github.com/ctg-tme/campfire-blueprint-macro`).catch(e => Handle.Error(e, 'SignInBanner.Set', 203));

  if ((isOnCall || isStreaming) || isSelfViewOn) { await AZM.Command.Zone.Monitor.Start('Initialization'); } else { await AZM.Command.Zone.Monitor.Stop('Initialization'); };

  // Check Selfview mode and fullscreen mode, then update the campfire UI extension
  await xapi.Command.UserInterface.Extensions.Widget.SetValue({ WidgetId: 'CampfireBlueprint~CameraFeatures~SelfviewShow', Value: isSelfViewOn == true ? 'On' : 'Off' });
  await xapi.Command.UserInterface.Extensions.Widget.SetValue({ WidgetId: 'CampfireBlueprint~CameraFeatures~SelfviewFullscreen', Value: isSelfviewFull == true ? 'On' : 'Off' });
  console.warn({ Campfire_1_Warn: `Campfire Blueprint Initialized!` })
  console.log('- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -')
}

/********************************
      Function Definitions
********************************/


//Builds Timeout Objects used to handle Conversation and Side By Side Mode
function buildAZMBasedTimeoutActivity() {
  const zones = AudioMap.Zones.clone()
  let list = {}
  zones.forEach((el, i) => {
    list[i + 1] = { label: el.Label, active: false, run: '' }
  })
  return list
}

//Used to check which version of USB Passthrough is used, and to alter the subscription needed for automation
async function checkUSBPassthroughState() {
  try {
    const hdmiPassthrough = await xapi.Status.Video.Output.HDMI.Passthrough.Status.get();
    if (hdmiPassthrough == 'Active') { return true; } else { return false; };
  } catch (e) { Handle.Error(e, 'HDMI.Passthrough.Status', 236) };

  try {
    const webCam = await xapi.Status.Video.Output.Webcam.Mode.get();
    if (webCam == 'Streaming') { return true; } else { return false; };
  } catch (e) { Handle.Error(e, 'Output.Webcam.Mode', 241) };

  return false;
}

//Clears timeouts and intervals contained within the Handle object
function clearCameraAutomationTimeouts() { // ToDo - Review for Errors
  try {
    const list = Object.getOwnPropertyNames(Handle.Timeout.CameraMode)
    list.forEach(element => {
      switch (element.safeToLowerCase()) {
        case 'onsilence':
          clearTimeout(Handle.Timeout.CameraMode.OnSilence.run)
          break;
        case 'speaker':
          clearTimeout(Handle.Timeout.CameraMode.Speaker.run)
          Handle.Timeout.CameraMode.Speaker.active = false;
          break;
        case 'conversation':
          const convList = Object.getOwnPropertyNames(Handle.Timeout.CameraMode.Conversation)
          if (convList.length > 0) {
            convList.forEach(el => {
              clearTimeout(Handle.Timeout.CameraMode.Conversation[el].run)
              Handle.Timeout.CameraMode.Conversation[el].active = false
            })
          }
          break;
        case 'everyone':
          Handle.Timeout.CameraMode.Speaker.active = false
          break;
        case 'spotlight':
          clearTimeout(Handle.Timeout.CameraMode.Spotlight.run)
          Handle.Timeout.CameraMode.Spotlight.active = false;
          break;
      }
    })
  } catch (e) {
    Handle.Error(e, 'clearCameraAutomationTimeouts', 347)
  }
}

// Used to compose a new MainSource composition based on a provided array
async function composeCamera(isDefault = false, ...connectorIds) {
  try {
    let composition = connectorIds.toString().split(',')
    if (isDefault) {
      composition = determineDefaultComposition()
    }
    currentComposition = composition.clone()

    if (composition == 'off' || composition == '') {
      return
    }

    const checkForCompositionChanges = (composition.length === lastknownComposition.length) && composition.every((value, index) => value === lastknownComposition[index]);
    //Only switch to the new camera arrangement if it's different from the last known state
    if (!checkForCompositionChanges) {
      try {
        let primaryQuadavailable = false;

        composition.forEach(el => {
          if (el == CodecInfo.PrimaryCodec.PrimaryCodec_QuadCamera_ConnectorId) { primaryQuadavailable = true }
        })

        if (primaryQuadavailable) {
          await xapi.Command.Cameras.SpeakerTrack.BackgroundMode.Deactivate();
        } else {
          await xapi.Command.Cameras.SpeakerTrack.BackgroundMode.Activate()
        }

        await xapi.Command.Video.Input.SetMainVideoSource({ ConnectorId: composition, Layout: 'Equal' });

        console.info({ Campfire_1_Info: `Updating Camera Composition: ${prettyCompositionLog_nodeInfo(composition)}` })
        lastknownComposition = composition.clone()
      } catch (e) {
        Handle.Error(e, 'checkForCompositionChanges', 561)
      }
    }
  } catch (e) {
    Handle.Error(e, 'composeCamera', 594)
  }
}

//Used to delay an action where necessary
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

// Determines the default overview camera composition based on user set configuration
function determineDefaultComposition() {
  let defaultComposition = []
  switch (Settings.Camera.DefaultOverview.Mode.safeToLowerCase()) {
    case 'on': case 'manual':
      defaultComposition = Settings.Camera.DefaultOverview.ManualComposition.clone();
      break;
    case 'off':
      defaultComposition = 'off'
      break;
    case 'auto': default:
      defaultComposition = peopleDataComposition.get();
      break;
  }
  return defaultComposition;
}

//Used to discover the Node ConnectorId based on provided Serial number
function findNodeCameraConnector(codecSerialNumber, cause) {

  for (const device of CodecInfo.NodeCodecs) {
    if (device.CodecSerialNumber == codecSerialNumber) {
      return device.PrimaryCodec_QuadCamera_ConnectorId;
    }
  }
  throw Error({ Campfire_1_Error: `Unable to Node Camera ConnectorId using Serial [${codecSerialNumber}]`, Cause: cause })
}

// Locate the Camera Id for the Primary Codec Quadcamera
async function findPrimaryQuadCameraId() {
  const cams = await xapi.Status.Cameras.Camera.get();
  let id = '';
  cams.forEach(el => { if (el.Model.toLowerCase().includes('quad')) { id = el.id } });
  return id;
};

// Used to pair the Device Label with it's associated Camera ConnectorId to allow a readable print of the provided composition
function prettyCompositionLog_nodeInfo(comp) {
  const resultString = comp.map(number => {
    const matchingItem = nodeInfo.find(item => item.PrimaryCodec_QuadCamera_ConnectorId === number.toString());
    return matchingItem ? `[${matchingItem.Label}: ${number}]` : `Connector: ${number}`;
  }).join(', ');
  return resultString;
}

// Used to execute the Muted Automation in Campfire
async function runMuteState() {
  switch (Settings.Camera.MutedOverview.Mode.toLowerCase()) {
    case 'auto':
      clearTimeout(Handle.Timeout.CameraMode.OnSilence)
      clearInterval(Handle.Interval.OnSilence)
      clearCameraAutomationTimeouts();
      updateCameraMode('Muted', 'Microphones Muted');
      await SendToNodes('MutedPTZ', 'Activate');
      await composeCamera(true, [])
      if (spkState) {
        await xapi.Command.Cameras.SpeakerTrack.Frames.Activate()
        await xapi.Command.Cameras.SpeakerTrack.Activate()
        await xapi.Command.Camera.PositionSet(mutedOverviewPTZPosition);
      }
    case 'manual':

      break;
    case 'off':
      break;
  }
  console.info({ Campfire_1_Info: `Microphones Muted, setting MutedOverview Mode: [${Settings.Camera.MutedOverview.Mode}]` })
}

//Used to define the Speakertrack behavior in the Camera Modes
async function setSpeakerTrack(mode) {
  try {
    switch (mode) {
      case 'Speaker': case 'Conversation': case 'QuestionAndAnswer':
        await xapi.Command.Cameras.SpeakerTrack.Activate()
        await xapi.Command.Cameras.SpeakerTrack.Frames.Deactivate()
        break;
      case 'Everyone':
        await xapi.Command.Cameras.SpeakerTrack.Activate()
        await xapi.Command.Cameras.SpeakerTrack.Frames.Activate()
        break;
      case 'Muted': case 'Off': case 'Presenter':
        await xapi.Command.Cameras.SpeakerTrack.Deactivate()
        await xapi.Command.Cameras.SpeakerTrack.Frames.Deactivate()
        break;
      default:
        console.warn({ Campfire_Node_Warn: `Camera Mode [${mode}] not defined.` })
        break
    }
  } catch (e) {
    Handle.Error(e, 'setSpeakerTrack', 267)
  }
}

async function configurePresetnerTrack(bool) {
  if (bool) {
    if (Settings.Camera.PresenterDetector.Mode) {
      Subscribe.PresenterDetectedStatus = function () {
        xapi.Status.Cameras.PresenterTrack.PresenterDetected.on(Handle.Status.PresenterDetectedStatus);
      }
    }
    xapi.Command.Cameras.PresenterTrack.Set({ Mode: 'Persistent' })
    const connectorId = await xapi.Config.Cameras.PresenterTrack.Connector.get();
    questionAndAnswerComposition = new CameraCompositionTracker([connectorId], [connectorId], 'QuestionAndAnswer', [connectorId]);
    console.error('TRACK_Presenter', questionAndAnswerComposition, Settings.Camera.PresenterDetector)
  }
}

// Used to updated the Campfire Camera Mode
async function updateCameraMode(mode, cause) {
  let availableModes = Object.getOwnPropertyNames(Settings.Camera.Mode)
  availableModes.push('Muted')
  availableModes.push('Off')

  if (!availableModes.includes(mode)) {
    console.warn({ Campfire_1_Warn: `[${mode}] mode is not defined in script`, Function: 'updateCameraMode()' })
    return
  }

  try {
    clearCameraAutomationTimeouts() //ToDo - Review and Check for Errors

    let previous = activeCameraMode.clone()

    if (activeCameraMode != 'Muted') {
      previousCameraMode = activeCameraMode.clone()
      switch (activeCameraMode) {
        case 'Speaker': case 'Conversation': case 'Everyone':
          previousQuadcameraMode = activeCameraMode.clone();
          break;
        case 'Presenter': case 'QuestionAndAnswer':
          previousPTZCameraMode = activeCameraMode.clone()
          break;
      }
    }

    activeCameraMode = mode;

    updateDiagCameraModeText('Unset', '')

    xapi.Command.UserInterface.Message.TextLine.Display({ Text: `Campfire: ${mode.replace(/_/gm, ' ')}`, Duration: 5, X: 10000, Y: 500 })
    if (activeCameraMode != 'Muted') {
      xapi.Command.UserInterface.Extensions.Widget.SetValue({ WidgetId: 'CampfireBlueprint~CameraFeatures~Info', Value: `${mode.replace(/_/gm, ' ')}: ${cameraModeDescriptions[mode]}` });
      try {
        await xapi.Command.UserInterface.Extensions.Widget.SetValue({ WidgetId: 'CampfireBlueprint~CameraFeatures~Mode', Value: activeCameraMode })
      } catch (e) {
        await xapi.Command.UserInterface.Extensions.Widget.UnsetValue({ WidgetId: 'CampfireBlueprint~CameraFeatures~Mode' })
        console.warn({ Campfire_1_Warn: `Unable to set mode group button to [${mode}]. This button may be hidden in Campfire_2_Config, is so, please disregard this warning`, Error: e.message })
      }
    }
    await setSpeakerTrack(mode) // ToDo - Review and Check for Errors
    await SendToNodes('CameraMode', activeCameraMode) //ToDo - Review and Check for Errors
    if (activeCameraMode != 'Muted') {
      await GMM.write('activeCameraMode', activeCameraMode)
      await GMM.write('previousPTZCameraMode', previousPTZCameraMode)
    }
    if (previous != activeCameraMode) {
      console.log({ Campfire_1_Log: `Camera Mode Updated`, CurrentMode: activeCameraMode, PreviousMode: previous, Cause: cause })
    }
    console.debug({ Campfire_1_Debug: `Camera Mode Updated`, CurrentMode: activeCameraMode, PreviousMode: previous, Cause: cause })
  } catch (e) {
    Handle.Error(e, 'updateCameraMode', 249)
  }
}

/********************************
      Subscription Definitions
********************************/

//Runs Subscriptions found in Subscribe Object, allows for controls start of subscriptions
async function StartSubscriptions() {
  const subs = Object.getOwnPropertyNames(Subscribe);
  subs.sort();
  let mySubscriptions = [];
  subs.forEach(element => {
    Subscribe[element]();
    mySubscriptions.push(element);
    Subscribe[element] = function () {
      console.warn({ Campfire_1_Warn: `The [${element}] subscription is already active, unable to fire it again` });
    };
  });
  console.log({ Campfire_1_Log: 'Subscriptions Set', Details: { Total_Subs: subs.length, Active_Subs: mySubscriptions.join(', ') } });
};

//Define subscriptions and run any other on boot actions requiring a status pull
const Subscribe = {
  WidgetAction: function () {
    xapi.Event.UserInterface.Extensions.Widget.Action.on(Handle.Event.WidgetAction)
  },
  PanelClicked: function () {
    xapi.Event.UserInterface.Extensions.Panel.Clicked.on(Handle.Event.PanelClicked)
  },
  AZM_Zones: function () {
    AZM.Event.TrackZones.on(Handle.Event.AZM_Zones)
  },
  GMM_Receiver: function () {
    GMM.Event.Receiver.on(Handle.Event.GMM_Receiver)
  },
  CallSuccessful: function () {
    xapi.Event.CallSuccessful.on(Handle.Event.CallSuccessful)
  },
  CallDisconnect: function () {
    xapi.Event.CallDisconnect.on(Handle.Event.CallDisconnect)
  },
  SelfView: function () {
    xapi.Status.Video.Selfview.on(Handle.Status.SelfView)
  },
  StandbyStatus: function () {
    xapi.Status.Standby.State.on(Handle.Status.StandbyStatus)
  },
  FramesStatus: function () {
    xapi.Status.Cameras.SpeakerTrack.Frames.Status.on(Handle.Status.FramesStatus)
  },
  MicrophonesMute: function () {
    xapi.Status.Audio.Microphones.Mute.on(Handle.Status.MicrophonesMute);
  },
  PromptResponse: function () {
    xapi.Event.UserInterface.Message.Prompt.Response.on(Handle.Event.PromptResponse);
  },
  RoomType: async function () {
    xapi.Status.Provisioning.RoomType.on(Handle.Status.RoomType)
  }
}

// The Handle object contains Objects or Functions that are handled in another process, such as an interval, event or status change
const Handle = {
  Timeout: {
    CameraMode: {
      OnSilence: { run: '' },
      Speaker: {
        active: false,
        run: ''
      },
      Conversation: buildAZMBasedTimeoutActivity(),
      Everyone: { active: false },
      Presenter: { active: false },
      QuestionAndAnswer: buildAZMBasedTimeoutActivity()
    },
    HiddenPanel: {
      count: 0,
      run: ''
    }
  },
  Interval: {
    OnSilence: ''
  },
  Error: function (err, func, lineReference) {
    err['Campfire_Context'] = { "Function": func, "Line": lineReference }
    console.error(err)
  }
}

// Event Handler definitions
Handle.Event = {
  CallSuccessful: async function () {
    try {
      xapi.Command.UserInterface.Message.TextLine.Display({ Text: `Campfire: ${activeCameraMode.replace(/_/gm, ' ')}`, Duration: 5, X: 10000, Y: 500 })
      await AZM.Command.Zone.Monitor.Start('CallSuccessful')
      composeCamera(true, [])
    } catch (e) {
      Handle.Error(e, 'Handle.Event.CallSuccessful', 400)
    }
  },
  CallDisconnect: async function () {
    try {
      await AZM.Command.Zone.Monitor.Stop('CallDisconnect')
      await updateCameraMode(Settings.Camera.DefaultMode, 'CallDisconnect')
    } catch (e) {
      Handle.Error(e, 'Handle.Event.CallDisconnect', 407)
    }
  },
  PromptResponse: async function (response) {
    if (response.FeedbackId == 'campfire~unmute~microphones~prompt' && response.OptionId == '1') {
      xapi.Command.Audio.Microphones.Unmute()
    }
  },
  WidgetAction: async function (action) {
    try {
      if (action.Type == 'released') {
        switch (action.WidgetId) {
          case 'CampfireBlueprint~CameraFeatures~Mode':
            if (activeCameraMode != 'Muted') {
              await updateCameraMode(action.Value, 'Widget Action')
            } else {
              xapi.Command.UserInterface.Message.Prompt.Display({
                Title: Text.PopUps.TouchPanel.MuteNotice.Title,
                Text: Text.PopUps.TouchPanel.MuteNotice.Text,
                Duration: 8,
                FeedbackId: `campfire~unmute~microphones~prompt`,
                "Option.1": Text.PopUps.TouchPanel.MuteNotice.Unmute,
                "Option.2": Text.PopUps.TouchPanel.MuteNotice.Dismiss
              });
              previousCameraMode = action.Value;
            }
            break;
        }
      }
      if (action.Type == 'changed') {
        switch (action.WidgetId) {
          case 'CampfireBlueprint~CameraFeatures~SelfviewShow':
            await xapi.Command.Video.Selfview.Set({ Mode: action.Value });
            break;
          case 'CampfireBlueprint~CameraFeatures~SelfviewFullscreen':
            await xapi.Command.Video.Selfview.Set({ FullscreenMode: action.Value });
            break;
        }
      }
    } catch (e) {
      Handle.Error(e, 'Handle.Event.WidgetAction', 416)
    }
  },
  PanelClicked: async function (event) {
    if (event.PanelId == 'CampfireBlueprint~Visible') {
      clearTimeout(Handle.Timeout.HiddenPanel.run)
      Handle.Timeout.HiddenPanel.count++
      if (Handle.Timeout.HiddenPanel.count >= 3) {
        if (Settings.Diagnostics.PinProtected.toLowerCase() == 'on') {
          xapi.Command.UserInterface.Message.TextInput.Display({
            Title: `Campfire Diagnostics`,
            Text: 'Campfire Diagnostics is Pin Protected, please enter the pin below.',
            Duration: 60,
            Placeholder: 'Enter Pin for Access',
            InputType: 'Pin',
            FeedbackId: `campfire~diagnostics~pin~prompt`
          })
          Handle.Timeout.HiddenPanel.count = 0
          return;
        } else {
          xapi.Command.UserInterface.Extensions.Panel.Open({ PanelId: 'CampfireBlueprint~Diagnostics' })
          Handle.Timeout.HiddenPanel.count = 0
          return;
        }
      }
      Handle.Timeout.HiddenPanel.run = setTimeout(async () => {
        try {
          xapi.Command.UserInterface.Extensions.Panel.Open({ PanelId: 'CampfireBlueprint~Hidden', PageId: 'CampfireBlueprint~CameraFeatures' })
          Handle.Timeout.HiddenPanel.count = 0
        } catch (e) {
          Handle.Error(e, 'Handle.Event.WidgetAction', 780)
        }
      }, 250)
    }
  },
  GMM_Receiver: async function (message) {
    try {
      if (message.App.includes('Campfire_Node')) {
        switch (message.Value.Method) {
          case 'PeopleCountUpdate': {
            if (Settings.Camera.DefaultOverview.Mode.safeToLowerCase() == 'auto') {
              if (message.Value.Data <= 0) {
                peopleDataComposition.removeCamera(findNodeCameraConnector(message.Source.Id))
              } else {
                peopleDataComposition.addCamera(findNodeCameraConnector(message.Source.Id))
              }
            }
          }
        }
      }
    } catch (e) {
      Handle.Error(e, 'Handle.Event.GMM_Receiver', 432)
    }
  },
  AZM_Zones: async function (zonePayload) {
    updateDiagAudioZoneText(zonePayload.Zone.State, zonePayload.Zone.Id)
    switch (activeCameraMode.safeToLowerCase()) {
      case 'speaker':
        try {
          //If Speaker the Speaker onJoin timeout is inactive and the Zone is high
          if (!Handle.Timeout.CameraMode.Speaker.active && zonePayload.Zone.State == `High`) {
            updateDiagCameraModeText('Active', zonePayload.Zone.Id)
            if (lastknownSpeaker_ZoneId != zonePayload.Zone.Id) {
              lastknownSpeaker_ZoneId = zonePayload.Zone.Id.clone()
              console.info({ Campfire_1_Info: `New Speaker Acquired in [${zonePayload.Zone.Label}] Zone || Id: [${zonePayload.Zone.Id}]` })
            }
            //Set the Speaker timeout activity to true
            Handle.Timeout.CameraMode.Speaker.active = true;

            //Set the Speaker timeout to false after the onjoin timeout clears
            Handle.Timeout.CameraMode.Speaker.run = setTimeout(function () {
              console.debug({ Campfire_1_Debug: `New Speaker Timeout Passed, waiting for new speaker...` })
              Handle.Timeout.CameraMode.Speaker.active = false;
            }, Settings.Camera.Mode.Speaker.TransitionTimeout.OnJoin);

            //Clear the on Room Silence Timeout, and reset it
            clearTimeout(Handle.Timeout.CameraMode.OnSilence)
            clearInterval(Handle.Interval.OnSilence)
            Handle.Timeout.CameraMode.OnSilence = setTimeout(async function () {
              updateDiagCameraModeText('Inactive', '')
              console.info({ Campfire_1_Info: `All Zones Quiet, setting defaults` })
              lastknownSpeaker_ZoneId = 0;
              await composeCamera(true, [])
              if (Settings.Camera.DefaultOverview.Mode.safeToLowerCase() == 'auto') {
                Handle.Interval.OnSilence = setInterval(async function () {
                  let peopleComposition = peopleDataComposition.get() == '' ? peopleDataComposition.DefaultComposition : peopleDataComposition.get();
                  await composeCamera(true, peopleComposition.DefaultComposition)
                }, 2000)
              }
            }, Settings.Camera.DefaultOverview.TransitionTimeout.OnSilence)

            //Compose the High Camera
            await composeCamera(false, zonePayload.Assets.CameraConnectorId)
          }
        } catch (e) {
          Handle.Error(e, 'Handle.Event.AZM > Speaker', 456)
        }
        break;
      case 'everyone':
        updateDiagCameraModeText('Active', '')
        if (!Handle.Timeout.CameraMode.Speaker.active) {
          Handle.Timeout.CameraMode.Speaker.active = true;
          clearTimeout(Handle.Timeout.CameraMode.OnSilence)
          clearInterval(Handle.Interval.OnSilence)
          await composeCamera(true, [])
          if (Settings.Camera.DefaultOverview.Mode.safeToLowerCase() == 'auto') {
            Handle.Interval.OnSilence = setInterval(async function () {
              let peopleComposition = peopleDataComposition.get() == '' ? peopleDataComposition.DefaultComposition : peopleDataComposition.get();
              await composeCamera(true, peopleComposition.DefaultComposition)
            }, 2000)
          }
        }
        break;
      case 'conversation':
        try {
          if (!Handle.Timeout.CameraMode.Conversation[zonePayload.Zone.Id].active && zonePayload.Zone.State == `High`) {
            console.info({ Campfire_1_Info: ` Zone [${zonePayload.Zone.Label}] added to the conversation || ZoneId: [${zonePayload.Zone.Id}]` })
            //Set the Conversation timeout activity to true
            Handle.Timeout.CameraMode.Conversation[zonePayload.Zone.Id].active = true;
            conversationComposition.addCamera(zonePayload.Assets.CameraConnectorId)

            updateDiagCameraModeText('Active', zonePayload.Zone.Id)

            //Set the Conversation timeout to false after the onjoin timeout clears
            clearTimeout(Handle.Timeout.CameraMode.OnSilence)
            clearInterval(Handle.Interval.OnSilence)
            function runHandler(timeout) {
              Handle.Timeout.CameraMode.Conversation[zonePayload.Zone.Id].run = setTimeout(function () {
                let checkState = AZM.Status.Audio.Zone[zonePayload.Zone.Id].State.get()
                if (checkState != 'High') {
                  console.info({ Campfire_1_Info: `Timeout for Zone [${zonePayload.Zone.Label}] passed, removing Zone Id: [${zonePayload.Zone.Id}] from the conversation` })
                  Handle.Timeout.CameraMode.Conversation[zonePayload.Zone.Id].active = false;
                  conversationComposition.removeCamera(zonePayload.Assets.CameraConnectorId)
                  let checkCompArr = conversationComposition.get()
                  if (checkCompArr.length < 1) {
                    updateDiagCameraModeText('Inactive', '')
                    console.info({ Campfire_1_Info: `All Zones Quiet, setting defaults` })
                    composeCamera(true, [])
                  }
                  if (Settings.Camera.DefaultOverview.Mode.safeToLowerCase() == 'auto') {
                    Handle.Interval.OnSilence = setInterval(async function () {
                      let peopleComposition = peopleDataComposition.get() == '' ? peopleDataComposition.DefaultComposition : peopleDataComposition.get();
                      await composeCamera(true, peopleComposition.DefaultComposition)
                    }, 2000)
                  }
                } else {
                  console.debug({ Campfire_1_Debug: `Zone [${zonePayload.Zone.Label}] conversation still active, continuing the conversation for Zone Id: [${zonePayload.Zone.Id}]` })
                  runHandler(Settings.Camera.Mode.Conversation.TransitionTimeout.Continue)
                }
              }, timeout);
            }
            runHandler(Settings.Camera.Mode.Conversation.TransitionTimeout.OnJoin)
            //Compose the High Camera
            await composeCamera(false, conversationComposition.get())
          }
        } catch (e) {
          Handle.Error(e, 'Handle.Event.AZM > Conversation', 492)
        }
        break
      case 'presenter':
        updateDiagCameraModeText('Active', '')
        break;
      case 'questionandanswer':
        try {
          if (!Handle.Timeout.CameraMode.QuestionAndAnswer[zonePayload.Zone.Id].active && zonePayload.Zone.State == `High`) {
            console.info({ Campfire_1_Info: ` Zone [${zonePayload.Zone.Label}] added to the question and answer session || ZoneId: [${zonePayload.Zone.Id}]` });
            //Set the Question and Answer timeout activity to true
            Handle.Timeout.CameraMode.QuestionAndAnswer[zonePayload.Zone.Id].active = true;
            questionAndAnswerComposition.addCamera(zonePayload.Assets.CameraConnectorId);
            questionAndAnswerComposition.shiftToFront(questionAndAnswerComposition.DefaultComposition[0]);

            updateDiagCameraModeText('Active', zonePayload.Zone.Id)

            //Set the Question And Answer timeout to false after the onjoin timeout clears
            clearTimeout(Handle.Timeout.CameraMode.OnSilence)
            clearInterval(Handle.Interval.OnSilence)
            function runHandler(timeout) {
              Handle.Timeout.CameraMode.QuestionAndAnswer[zonePayload.Zone.Id].run = setTimeout(function () {
                let checkState = AZM.Status.Audio.Zone[zonePayload.Zone.Id].State.get()
                if (checkState != 'High') {
                  console.info({ Campfire_1_Info: `Timeout for Zone [${zonePayload.Zone.Label}] passed, removing Zone Id: [${zonePayload.Zone.Id}] from the question and answer session` })
                  Handle.Timeout.CameraMode.QuestionAndAnswer[zonePayload.Zone.Id].active = false;
                  questionAndAnswerComposition.removeCamera(zonePayload.Assets.CameraConnectorId);
                  questionAndAnswerComposition.shiftToFront(questionAndAnswerComposition.DefaultComposition[0]);
                  let checkCompArr = questionAndAnswerComposition.get();
                  if (checkCompArr.length < 2) {
                    console.info({ Campfire_1_Info: `All Zones Quiet, setting defaults` });
                    questionAndAnswerComposition.reset();
                    composeCamera(false, questionAndAnswerComposition.get());
                  }
                  if (Settings.Camera.DefaultOverview.Mode.safeToLowerCase() == 'auto') {
                    Handle.Interval.OnSilence = setInterval(async function () {
                      let peopleComposition = peopleDataComposition.get() == '' ? peopleDataComposition.DefaultComposition : peopleDataComposition.get();
                      await composeCamera(true, peopleComposition.DefaultComposition);
                    }, 2000);
                  }
                } else {
                  console.debug({ Campfire_1_Debug: `Zone [${zonePayload.Zone.Label}] still active, continuing the question and answer session for Zone Id: [${zonePayload.Zone.Id}]` });
                  runHandler(Settings.Camera.Mode.QuestionAndAnswer.TransitionTimeout.Continue);
                };
              }, timeout);
            }

            runHandler(Settings.Camera.Mode.QuestionAndAnswer.TransitionTimeout.OnJoin)
            //Compose the High Camera
            questionAndAnswerComposition.shiftToFront(questionAndAnswerComposition.DefaultComposition[0])
            await composeCamera(false, questionAndAnswerComposition.get())
          }
        } catch (e) {
          Handle.Error(e, 'Handle.Event.AZM > Question and Answer', 944)
        }
        break;
      case 'muted':
        break;
      case 'off':
        break;
      default:
        break
    }
  }
}

function updateDiagAudioZoneText(state, id) {
  const zone = AudioMap.Zones[id - 1].clone()
  const msg = `State: ${state} || Type: ${zone.MicrophoneAssignment.Type} || CameraConnectorId: ${zone.Assets.CameraConnectorId}`

  xapi.Command.UserInterface.Extensions.Widget.SetValue({ WidgetId: `CampfireBlueprint~Diagnostics~AudioZones~${id}`, Value: msg })
}

function updateDiagCameraModeText(state, zone) {
  let timeout = 'N/A';
  if (Settings.Camera.Mode[activeCameraMode]?.TransitionTimeout) {
    timeout = Settings.Camera.Mode[activeCameraMode].TransitionTimeout.toString()
  }
  let activeZones = []
  let zones = zone
  if (activeCameraMode == 'Conversation' || activeCameraMode == 'QuestionAndAnswer') {
    let ids = Object.getOwnPropertyNames(Handle.Timeout.CameraMode[activeCameraMode])

    ids.forEach(element => {
      if (Handle.Timeout.CameraMode[activeCameraMode][element].active) {
        activeZones.push(element)
      }
    })
    zones = activeZones.toString()
  }

  let msg = `State: ${state} || Zone(s): [${zones}] || Mode: ${activeCameraMode} || Timeout: ${timeout}`

  xapi.Command.UserInterface.Extensions.Widget.SetValue({ WidgetId: `CampfireBlueprint~Diagnostics~SpeakerLock`, Value: msg })
}

function updateDiagPeopleCountText(target, value) {
  switch (target) {
    case 'Primary':

      break;
    case 'Total':
      break;
    default:
      break
  }
}

/*
const Handle = {
  Timeout: {
    CameraMode: {
      OnSilence: { run: '' },
      Speaker: {
        active: false,
        run: ''
      },
      Conversation: buildAZMBasedTimeoutActivity(),
      Everyone: { active: false },
      Presenter: { active: false },
      QuestionAndAnswer: buildAZMBasedTimeoutActivity()
    },
 */

// Status Handler Definitions
Handle.Status = {
  SelfView: async function (view) {
    try {
      const isOnCall = (await xapi.Status.Call.get()) == '' ? false : true;
      if (view?.Mode) {
        await xapi.Command.UserInterface.Extensions.Widget.SetValue({ WidgetId: 'CampfireBlueprint~CameraFeatures~SelfviewShow', Value: view.Mode });
        if (!isOnCall) {
          switch (view.Mode) {
            case 'On':
              await AZM.Command.Zone.Monitor.Start('SelviewMode On Outside Call')
              await xapi.Command.UserInterface.Extensions.Widget.SetValue({ WidgetId: 'CampfireBlueprint~CameraFeatures~SelfviewShow', Value: 'On' });
              break;
            case 'Off':
              await AZM.Command.Zone.Monitor.Stop('SelviewMode Off Outside Call')
              await xapi.Command.UserInterface.Extensions.Widget.SetValue({ WidgetId: 'CampfireBlueprint~CameraFeatures~SelfviewShow', Value: 'Off' });
              break;
          }
        }
      }
      if (view?.FullscreenMode) {
        await xapi.Command.UserInterface.Extensions.Widget.SetValue({ WidgetId: 'CampfireBlueprint~CameraFeatures~SelfviewFullscreen', Value: view.FullscreenMode });
      }
    } catch (e) {
      Handle.Error(e, 'Handle.Status.Selfview', 540)
    }
  },
  StandbyStatus: async function (level) {
    try {
      if (level == 'Standby' || level == 'Off') {
        await SendToNodes('StandbyState', level)
      }
    } catch (e) {
      Handle.Error(e, 'Handle.Status.StandbyStatus', 554)
    }
  },
  FramesStatus: async function (state) {
    try {
      await SendToNodes('FramesState', state)
    } catch (e) {
      Handle.Error(e, 'Handle.Status.FramesStatus', 561)
    }
  },
  MicrophonesMute: async function (mute) {
    if (mute == 'On') {
      await runMuteState()
    } else {
      await updateCameraMode(previousCameraMode);
    }
  },
  PeopleCountCurrent: async function (count) {
    if (Settings.Camera.DefaultOverview.Mode.safeToLowerCase() == 'auto') {
      if (count <= 0) {
        peopleDataComposition.removeCamera(CodecInfo.PrimaryCodec.PrimaryCodec_QuadCamera_ConnectorId)
      } else {
        peopleDataComposition.addCamera(CodecInfo.PrimaryCodec.PrimaryCodec_QuadCamera_ConnectorId)
      }
    }
  },
  PresenterDetectedStatus: async function (presenter) {
    if (presenter == 'True' && Settings.Camera.PresenterDetector.Mode) {
      questionAndAnswerComposition.reset()
      switch (Settings.Camera.PresenterDetector.DefaultCameraMode.toLowerCase()) {
        case 'auto':
          await updateCameraMode(previousPTZCameraMode, 'Presenter Detected - Auto');
          break;
        case 'presenter':
          await updateCameraMode('Presenter', 'Presenter Detected - Presenter');
          break;
        case 'questionandanswer':
          await updateCameraMode('Presenter', 'Presenter Detected - Question and Answer');
          break;
      }
      await composeCamera(false, questionAndAnswerComposition.get())
    } else {
      updateCameraMode(previousQuadcameraMode, 'Presenter Left');
      await composeCamera(true, []);
    }
  },
  RoomAnalytics: async function (event) {
    if (event.toLowerCase() != 'standard') {
      await disableSolution(`Invalid Endpoint Config. Provisioning RoomType [${event}] conflicts with Campfire Blueprint.`)
    }
  }
}

/********************************
        Start Macro
********************************/

// Used to handle a device restart, on boot, the script runs too quickly, causing an error.
// This slows that process down by checking the uptime
async function delayedStartup(time = 120) {
  while (true) {
    const upTime = await xapi.Status.SystemUnit.Uptime.get()

    if (upTime > time) {
      await delay(10);
      await init();
      break;
    } else {
      delay(5000);
    }
  }
}

delayedStartup();

export const version = '1.2'; //Future Use