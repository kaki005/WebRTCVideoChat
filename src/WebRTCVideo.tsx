import React, { useEffect, useState, useRef } from 'react';
import logo from './logo.svg';
import './App.css';
import './index.css';
import WebRTC from "./model/WebRTC";

interface IProp {
}



const WebRTCVideo: React.FC<IProp> = (prop: IProp) => {
    const remoteVideoRef = useRef<HTMLVideoElement>(null);                              // 相手のビデオ
    const localVideoRef = useRef<HTMLVideoElement>(null);                               // 自身のビデオ
    const [messages, setMessages] = useState([] as string[]);                           // メッセージリスト
    const [client, setClient] = useState(new WebRTC(remoteVideoRef, localVideoRef));    // 画面更新後のインスタンスが残るようuseStateを使う
    const [sendText, setSendText] = useState("");                                       // 送信メッセージ

    const StartWebRTC = () => {
        client.StartWebRTCConnection();                                                 // WebRTCによる通信開始
    };
    const SendMessage = () => {
        setMessages((currentList) => [...currentList, `自分： ${sendText}`]);
        client.SendMessage(sendText);
        setSendText("");
    }
    const onChangedSendText = (e: (React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLSelectElement>)) => {
        const text = e.target.value;
        setSendText(text);
    };

    let isFirstCalled = true;
    useEffect(() => {
        if (isFirstCalled) {
            client.ConnectSignalingServer();
            client.OnRecvMessage = (message: string) => {
                setMessages((currentList) => [...currentList, `相手： ${message}`]);
            }
        }
        isFirstCalled = false;
    }, []);                                                                             // 最初に一度のみ呼ばれる

    return <div>
        <table>
            <thead>
                <tr>
                    <th>相手のスクリーン</th>
                    <th>自分のスクリーン</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>
                        <video
                            ref={remoteVideoRef}
                            id="remote-video"
                            autoPlay
                            playsInline
                            muted
                            width={500}
                            height={400}
                        />
                    </td>
                    <td>
                        <video
                            ref={localVideoRef}
                            id="local-video"
                            autoPlay
                            playsInline
                            muted
                            width={500}
                            height={400} />
                    </td>
                </tr>
            </tbody>
        </table>
        <div>
            <button onClick={StartWebRTC}>Start WebRTC</button>
        </div>
        <div>
            <input type="text" placeholder="Your message.." onChange={onChangedSendText} value={sendText} />
            <button onClick={SendMessage}>メッセージ送信</button>
        </div>

        <div>
            <table>
                <thead>
                    <tr>
                        <td> メッセージ</td>
                    </tr>
                </thead>
                <tbody>
                    {(messages.map((item, idx) => <tr key={idx}><td>{item}</td></tr>))}
                </tbody>
            </table>
        </div>
    </div>;
};

export default WebRTCVideo;
