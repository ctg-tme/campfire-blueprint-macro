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
*/

const Text = {
  Panel: {
    Name: `Campfire Controls`,
    Page: {
      Name: `Campfire Controls`,
      Info: {
        Name: 'Info'
      },
      Mode: {
        Name: `Mode`,
        Buttons: {
          Speaker: {
            Title: `Speaker`,
            Emoji: '👤',
            Description: `Maintain focus on the active speaker in your room, so your audience doesn't lose sight of them`
          },
          Everyone: {
            Title: `Everyone`,
            Emoji: '👥',
            Description: `Promote Equity in your space, leveraging all 4 cameras and Frames Camera Intelligence`
          },
          Conversation: {
            Title: `Conversation`,
            Emoji: '🗣️',
            Description: `Keep the conversations alive, by mixing all cameras with a closeup of each active speaker`
          },
          Presenter: {
            Title: `Presenter`,
            Emoji: '🧑‍🏫',
            Description: `Lock onto the stage and follow the Presenter throughout the call`
          },
          QuestionAndAnswer: {
            Title: `Question &amp; Answer`,
            Emoji: '❓',
            Description: `A combination of Speaker and Presenter, keeping focus on the presenter and dynamiclly adding speakers sitting around the campfire`
          },
          Off: {
            Title: `Off`,
            Emoji: '💤',
            Description: `Campfire Automation Disabled`
          }
        }
      },
      Tracking: {
        Name: 'Tracking',
        Buttons: {
          Off: {
            Title: `Off`,
            Emoji: '💤'
          },
          On: {
            Title: `On`,
            Emoji: '💤'
          }
        }
      },
      PresenterDetector: {
        Name: `Presenter Detector`,
        Buttons: {
          Disable: `Disable`,
          Enable: `Enable`
        }
      },
      SelfView: {
        Name: `SelfView`,
        Buttons: {
          Show: `Show`,
          Fullscreen: `Fullscreen`
        }
      }
    }
  },
  PopUps: {
    TouchPanel: {
      MuteNotice: {
        Title: `Your Microphones are Muted`,
        Text: `Campfire Modes won't take effect until you Unmute your Microphones.`,
        Unmute: `Unmute Microphones`,
        Dismiss: `Dismiss`
      }
    }
  }
};

export { Text };