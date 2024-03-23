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
import xapi from 'xapi';
import { Settings } from './Campfire_2_Config';
import { Text } from './Campfire_5_TextLocalization';

async function BuildUserInterface() {
  console.log({ Campfire_4_Log: 'Building UserInterface...' })
  let orderLocation = '';

  let aboutRows = '';
  let aboutRowList = Object.getOwnPropertyNames(aboutInformation)

  const isPresetnerTrackAvailable = (await xapi.Status.Cameras.PresenterTrack.Availability.get()) == 'Available' ? true : false;

  console.debug({ Campfire_4_Debug: `PresenterTrack is [${isPresetnerTrackAvailable}]` });

  let modes = Object.getOwnPropertyNames(Settings.UserInterface.Visibility.CameraMode);
  let visibleModes = [];
  modes.forEach(el => { if (Settings.UserInterface.Visibility.CameraMode[el].toLowerCase() == 'auto') { visibleModes.push(el) } });

  console.debug({ Campfire_4_Debug: 'Visible Camera Modes Identified', Modes: visibleModes });

  if (visibleModes.length < 1 && Settings.UserInterface.Visibility.Panel.toLowerCase() == 'auto') {
    console.warn({ Campfire_3_Warn: 'All Camera modes are hidden, and the Panel is visible, this may cause confusion to the user' });
  };

  let modesXMLDefinitions = {
    Speaker: `<Value><Key>Speaker</Key><Name>${Text.Panel.Page.Mode.Buttons.Speaker.Title} ${Text.Panel.Page.Mode.Buttons.Speaker.Emoji}</Name></Value>`,
    Everyone: `<Value><Key>Everyone</Key><Name>${Text.Panel.Page.Mode.Buttons.Everyone.Title} ${Text.Panel.Page.Mode.Buttons.Everyone.Emoji}</Name></Value>`,
    Conversation: `<Value><Key>Conversation</Key><Name>${Text.Panel.Page.Mode.Buttons.Conversation.Title} ${Text.Panel.Page.Mode.Buttons.Conversation.Emoji}</Name></Value>`,
    Presenter: `<Value><Key>Presenter</Key><Name>${Text.Panel.Page.Mode.Buttons.Presenter.Title} ${Text.Panel.Page.Mode.Buttons.Presenter.Emoji}</Name></Value>`,
    QuestionAndAnswer: `<Value><Key>QuestionAndAnswer</Key><Name>${Text.Panel.Page.Mode.Buttons.QuestionAndAnswer.Title} ${Text.Panel.Page.Mode.Buttons.QuestionAndAnswer.Emoji}</Name></Value>`
  };

  async function formModeGroupButton() {
    let list = Object.getOwnPropertyNames(modesXMLDefinitions);
    let xml = ``;
    list.forEach(el => {
      if (Settings.UserInterface.Visibility.CameraMode[el].toLowerCase() != 'auto') {
        console.debug({ Campfire_4_Info: `[${el}] xml removed`, Cause: 'UserInterface Settings' });
        delete modesXMLDefinitions[el]
      }
      if (!isPresetnerTrackAvailable && (el == 'Presenter' || el == 'QuestionAndAnswer')) {
        console.debug({ Campfire_4_Info: `[${el}] xml removed`, Cause: 'Presentertrack Availability' });
        delete modesXMLDefinitions[el];
      };
      if (modesXMLDefinitions[el] != undefined) {
        xml = xml + modesXMLDefinitions[el];
      };
    });

    if (xml != '') {
      xml = `<Row>
            <Name>${Text.Panel.Page.Mode.Name}</Name>
            <Widget>
              <WidgetId>Campfire~Blueprint~CameraFeatures~Mode</WidgetId>
              <Type>GroupButton</Type>
              <Options>size=4;columns=2</Options>
              <ValueSpace>
                ${xml}
                <Value>
                  <Key>Off</Key>
                  <Name>${Text.Panel.Page.Mode.Buttons.Off.Title} ${Text.Panel.Page.Mode.Buttons.Off.Emoji}</Name>
                </Value>
              </ValueSpace>
            </Widget>
          </Row>`
    } else {
      console.ingo({ Campfire_4_Info: `Mode XML not populated, bubbling up Tracking Controls` })
      xml = `<Row>
            <Name>${Text.Panel.Page.Tracking.Name}</Name>
            <Widget>
              <WidgetId>Campfire~Blueprint~CameraFeatures~Tracking</WidgetId>
              <Type>GroupButton</Type>
              <Options>size=4;columns=2</Options>
              <ValueSpace>
                <Value>
                  <Key>Off</Key>
                  <Name>${Text.Panel.Page.Tracking.Buttons.Off.Title} ${Text.Panel.Page.Tracking.Buttons.Off.Emoji}</Name>
                </Value>
                <Value>
                  <Key>On</Key>
                  <Name>${Text.Panel.Page.Tracking.Buttons.On.Title} ${Text.Panel.Page.Tracking.Buttons.On.Emoji}</Name>
                </Value>
              </ValueSpace>
            </Widget>
          </Row>`
    };
    return new Promise(resolve => resolve(xml));
  };

  let presenterDetectedRow = `<Row>
            <Name>${Text.Panel.Page.PresenterDetector.Name}</Name>
            <Widget>
              <WidgetId>Campfire~Blueprint~CameraFeatures~PresenterDetector</WidgetId>
              <Type>GroupButton</Type>
              <Options>size=4</Options>
              <ValueSpace>
                <Value>
                  <Key>Disable</Key>
                  <Name>${Text.Panel.Page.PresenterDetector.Buttons.Disable}</Name>
                </Value>
                <Value>
                  <Key>Enable</Key>
                  <Name>${Text.Panel.Page.PresenterDetector.Buttons.Enable}</Name>
                </Value>
              </ValueSpace>
            </Widget>
          </Row>`


  if (Settings.UserInterface.Visibility.PresenterDetector.toLowerCase() != 'auto') {
    presenterDetectedRow = '';
    console.debug({ Campfire_4_Info: `PresenterDetector xml removed`, Cause: 'UserInterface Settings' })
  }

  aboutRowList.forEach((el, i) => {
    aboutRows = aboutRows + `<Row>
      <Widget><WidgetId>Campfire~Blueprint~About~Row_${i}</WidgetId><Name>${aboutInformation[el]}</Name><Type>Text</Type><Options>size=4;fontSize=small;align=left</Options></Widget>
    </Row> `
  });

  if (typeof Settings.UserInterface.ListPosition == 'number' && Settings.UserInterface.ListPosition > 0) {
    console.info({ Campfire_4_Info: `Panel order set to [${Settings.UserInterface.ListPosition}]` })
    orderLocation = `<Order> ${Settings.UserInterface.ListPosition}</Order> `;
  } else {
    console.info({ Campfire_4_Info: `Panel order outside range, letting endpoint apply order xml` })
  }

  let UserInterfaceXML = `<Extensions>
      <Panel>
        ${orderLocation}
        <Origin>local</Origin>
        <Location>${Settings.UserInterface.Location}</Location>
        <Icon>Custom</Icon>
        <Name>${Text.Panel.Name}</Name>
        <ActivityType>Custom</ActivityType>
    ${Campfire_Icon}
        <Page>
          <Name>${Text.Panel.Page.Name}</Name>
          <!--
        Comment: Info Row
      -->
      <Row>
            <Name>${Text.Panel.Page.Info.Name}</Name>
            <Widget>
              <WidgetId>Campfire~Blueprint~CameraFeatures~Info</WidgetId>
              <Name>${Text.Panel.Page.Mode.Buttons.Speaker.Title}: ${Text.Panel.Page.Mode.Buttons.Speaker.Text}</Name>
              <Type>Text</Type>
              <Options>size=4;fontSize=normal;align=left</Options>
            </Widget>
          </Row>
          <!--
        Comment: Mode Row
      -->
          ${await formModeGroupButton()}
          <!--
        Comment: Presenter Detected Row
      -->
      ${presenterDetectedRow}
          <!--
        Comment: Selfview Row
      -->
      <Row>
            <Name>${Text.Panel.Page.SelfView.Name}</Name>
            <Widget>
              <WidgetId>Campfire~Blueprint~CameraFeatures~SelfviewShowText</WidgetId>
              <Name>${Text.Panel.Page.SelfView.Buttons.Show}</Name>
              <Type>Text</Type>
              <Options>size=1;fontSize=small;align=center</Options>
            </Widget>
            <Widget>
              <WidgetId>Campfire~Blueprint~CameraFeatures~SelfviewShow</WidgetId>
              <Type>ToggleButton</Type>
              <Options>size=1</Options>
            </Widget>
            <Widget>
              <WidgetId>Campfire~Blueprint~CameraFeatures~SelfviewFullscreenText</WidgetId>
              <Name>${Text.Panel.Page.SelfView.Buttons.Fullscreen}</Name>
              <Type>Text</Type>
              <Options>size=1;fontSize=small;align=center</Options>
            </Widget>
            <Widget>
              <WidgetId>Campfire~Blueprint~CameraFeatures~SelfviewFullscreen</WidgetId>
              <Type>ToggleButton</Type>
              <Options>size=1</Options>
            </Widget>
          </Row>
          <PageId>Campfire~Blueprint~CameraFeatures</PageId>
          <Options>hideRowNames=0</Options>
        </Page>
        <Page>
          <Name>About</Name>
            ${aboutRows}
          <Options>hideRowNames=1</Options>
        </Page>
      </Panel>
</Extensions> `;

  await xapi.Command.UserInterface.Extensions.Panel.Remove({ PanelId: 'Campfire~CampfirePro' }).catch(e => console.debug({ Campfire_4_Debug: 'Unable to remove Legacy Campfire ID', message: e.message }));
  console.debug({ Campfire_4_Debug: 'Legacy Campfire Controls Panel removed' })

  return new Promise(async resolve => {
    try {
      await xapi.Command.UserInterface.Extensions.Panel.Save({ PanelId: 'Campfire~Blueprint' }, UserInterfaceXML);
      console.log({ Campfire_4_Log: 'Userinterface Built!' });
      resolve();
    } catch (e) {
      throw Error({ Campfire_4_Error: 'Failed to build UserInterface Elements', message: e.message });
    };
  });
};

const Campfire_Icon = `<CustomIcon>
      <Content>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</Content>
      <Id>dcfa9af0df29725c6c2bdd6fc46da691171607f46b09c630cc1f66a98439ce24</Id>
    </CustomIcon>`

const aboutInformation = {
  Row_1: `The Campfire Blueprint Macro is a custom solution leveraging Cisco Device xAPI's, the Macro and UI Extensions Editors to enable a near 360° conference room view.`,
  Row_2: `Since the Campfire Blueprint Macro is considered custom, the features and functions employed by Campfire are NOT supported by Cisco TAC`,
  Row_3: `For support, we recommend you work with an Audio Visual Partner and/or review the Campfire Documentation on Github`,
  Row_4: `Thank you, and we hope you enjoy the experience!`
};

export { BuildUserInterface };