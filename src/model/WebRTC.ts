import { RefObject } from "react";
import SignalingClient from "./SignalingClient";
import assert from 'assert';


// WebRTCによる通信クラス
export default class WebRTC {
    // ===============================================================================
    // プロパティ
    // ===============================================================================
     // コネクション
    get IsPeerConnectionSet() { return this._peerConnection != null };
    private _peerConnection: RTCPeerConnection | null;

     // 経路候補クラス
    set IceCandidate(candidate: RTCIceCandidate) { this._candidate = candidate; }
    private _candidate: RTCIceCandidate | null;

     // データチャネルが設定されているか
    IsDataChannelSet = () => { return this._dataChannel != null; }
    //  データチャネル
    set DataChannel(channel: RTCDataChannel) { this._dataChannel = channel; }
    private _dataChannel: RTCDataChannel | null;

     // メッセージ受信時のイベント
    set OnRecvMessage(func: (this: WebRTC, message: string) => any) { this._onRecvMessage = func; }
    private _onRecvMessage: ((this: WebRTC, message: string) => any) | null = null;

    // ===============================================================================
    // メンバ変数
    // ===============================================================================
    // 自分側のストリーム
    private _localStream: MediaStream | null = null;
    // 相手側のビデオのソース
    private _remoteVideoRef: RefObject<HTMLVideoElement>;
    // 自分側のビデオのソース
    private _localVideoRef: RefObject<HTMLVideoElement>;
    // 受信したIceCandidateを保管しておくリスト
    private _iceCandidates: RTCIceCandidate[] = [];
    // WebSocketによるシグナル通信クライアント
    private _signalClient: SignalingClient;

    // ===============================================================================
    // コンストラクタ
    // ===============================================================================
    constructor(remoteVideo: RefObject<HTMLVideoElement>,  localVideo: RefObject<HTMLVideoElement>) {
        this._candidate = null;
        this._peerConnection = null;
        this._dataChannel = null;
        this._signalClient = new SignalingClient();
        this._remoteVideoRef = remoteVideo;
        this._localVideoRef = localVideo;
    }


    // ===============================================================================
    // メソッド
    // ===============================================================================
    // -------------------------------------------------------------------------------
    //#region + ConnectSignalingServer：シグナリングサーバへの接続
    // -------------------------------------------------------------------------------
    ConnectSignalingServer() {
        this._signalClient.Connect();
        const RTC = this;
        const socket: WebSocket = this._signalClient.Socket;
        socket.onmessage = function (event) {
            console.log("SDP受信 " + event.data);                   //event.data でサーバーからの通知を受信 
            RTC.ProcessSDP(event.data);                                 // 受信したSDPを処理する
        };

    }

    // -------------------------------------------------------------------------------
    //#region + StartWebRTCConnection：WebRTCコネクション確立の開始
    // -------------------------------------------------------------------------------
    StartWebRTCConnection() {
        // WebRTCのコネクション確立開始
        this._peerConnection = this.CreatePeerConnection();         // PeerConnection開始
        const CHANNEL_NAME = "chat";                                // DataChannel名
        this._dataChannel = this._peerConnection.createDataChannel(CHANNEL_NAME); // DataChannel作成
        this.SetupDataChannel();
        //this.SendOfferSDP();                                      // 相手に自分のSDPを送信(映像を送らない場合はここで送る)
        // 画面共有
        var option = { video: true, audio: false };
        navigator.mediaDevices.getDisplayMedia(option)              
            .then(stream => {
                this._localStream = stream;                         // ストリームを設定
                this._localStream.getTracks().forEach(track => this._peerConnection!.addTrack(track, stream));  // トラックを相手に送るよう設定
                stream.onremovetrack = (e) => {                     // トラック削除時のイベント
                    this._localVideoRef.current!.srcObject = null;  // ビデオのソースを未設定に
                };
                this._localVideoRef.current!.srcObject = stream;    // ビデオを画面に表示
                this.SendOfferSDP();                                // 相手に自分のSDPを送信
            })
            .catch(function (err) {
                console.error(err);
            });
    }

    // -------------------------------------------------------------------------------
    //#region + StopWebRTCConnection：WebRTCコネクションの終了
    // -------------------------------------------------------------------------------
    StopWebRTCConnection() {
        this._dataChannel?.close();
        this._dataChannel = null;
        this._peerConnection?.close();
        this._peerConnection = null;
    }

    // -------------------------------------------------------------------------------
    //#region + SendMessage：WebRTCによるメッセージの送信
    // -------------------------------------------------------------------------------
    SendMessage(message: string) {
        if (this._dataChannel == null) {
            console.log("dataChannelが無効です。");
            return;
        }
        this._dataChannel.send(message);                     // メッセージを送信
        console.log("メッセージ送信:" + message);
    }

    // -------------------------------------------------------------------------------
    //#region + CreatePeerConnection：PeerConnectionの作成
    // -------------------------------------------------------------------------------
    private CreatePeerConnection = (): RTCPeerConnection => {
        let RTC = this;
        let pc = new RTCPeerConnection({
            iceServers: [
                { "urls": 'stun:stun.l.google.com:19302' },
                { "urls": "stun:stun.webrtc.ecl.ntt.com:3478" }             // STUNサーバのアドレスを登録
            ]
        });                                                  // PeerConnectionオブジェクト作成
        pc.onicecandidate = (e) => {
            if (e.candidate) {                               // 候補がnullでなければ
                RTC.IceCandidate = e.candidate;              // Candidateを記録しておく。
                console.log("IceCandidate 収集イベント");
                if (RTC.IsPeerConnectionSet) {               // コネクションが確立されていれば
                    this._signalClient.SendData(JSON.stringify({ type: 'candidate', ice: e.candidate }));
                }
            }
        };
        // コネクション状態変化時のイベント
        pc.onconnectionstatechange = function (e) {
            switch (pc.connectionState) {
                case "connected":
                    console.log("コネクション状態変化 : 接続中");
                    break;
                case "disconnected":
                case "failed":
                    console.log("コネクション状態変化 : 接続断");
                    break;
                case "closed":
                    console.log("コネクション状態変化 : 接続を終了");
                    break;
            }
        };
        pc.ondatachannel = event => {                          // dataChannel作成時イベント
            console.log("on datachannel");
            this._dataChannel = event.channel;                 // DataChannelを記録
            this.SetupDataChannel();                           // DataChannelの初期設定
        };
        /// 相手側ののMediaStreamTrackを受信した時のイベント
        pc.ontrack = e => {
            const stream = e.streams[0];                        // ストリーム
            const track = e.track;                              // トラック 
            console.log("PeerConnection ontrack :" + stream); 
            pc.addTrack(track, stream);                         // トラックを追加
            this._remoteVideoRef.current!.srcObject = stream;   // ストリームをビデオに設定
            stream.onremovetrack = (e) => {                     // トラック削除時のイベント
                this._remoteVideoRef.current!.srcObject = null; // ビデオのソースを未設定に
            };
        };
        return pc;
    };

    // -------------------------------------------------------------------------------
    //#region - SetupDataChannel：DataChannelの初期設定
    // -------------------------------------------------------------------------------
    private SetupDataChannel = () => {
        assert(this._dataChannel != null);
        this._dataChannel.onopen = this.OnDataChannelStateChanged;
        this._dataChannel.onclose = this.OnDataChannelStateChanged;
        this._dataChannel.onmessage = event => this.OnMessageReceived(event.data);
        this._dataChannel.onerror = function (ex) {               // 例外発生時のイベント
            console.log('Data channel のOnErrorイベント:', ex);
        };
    };
    // -------------------------------------------------------------------------------
    //#region - OnDataChannelStateChanged：DataChannelの状態変化時イベント
    // -------------------------------------------------------------------------------
    private OnDataChannelStateChanged = (event: Event) => {
        console.log('WebRTC channel の現在の状態 : ', this._dataChannel?.readyState);
        if (this._dataChannel?.readyState == "open") {
            this._signalClient.Disconnect();
        }
    };

    // -------------------------------------------------------------------------------
    //#region - OnMessageReceived：DataChannelでのメッセージ受信イベント
    // -------------------------------------------------------------------------------
    private OnMessageReceived(message: string) {
        console.log("受信しました。：" + message);
        if (this._onRecvMessage != null) this._onRecvMessage(message);
    }

    // -------------------------------------------------------------------------------
    //#region - ProcessSDP：受信したSDPの処理
    // -------------------------------------------------------------------------------
    private ProcessSDP(sdpStr: string) {
        let sdpObject = JSON.parse(sdpStr);                                 // JSONを解析
        console.log(`メッセージ受信：${sdpObject.type}`);
        switch (sdpObject.type) {                                           // typeキーの値によって処理を分岐
            case 'offer':                                                   // 呼び出し側 -> 受け取り側のSDP
                let offer = new RTCSessionDescription(sdpObject);
                if (this._peerConnection) {
                    console.error('peerConnectionは既に存在します。');
                    return;
                }
                this._peerConnection = this.CreatePeerConnection();
                // 画面共有の設定
                var option = { video: true, audio: false };
                navigator.mediaDevices.getDisplayMedia(option)              // 画像共有用のメディア取得
                    .then(stream => {
                        this._localStream = stream;                         // ローカルストリームに設定
                        this._localStream.getTracks().forEach(track => this._peerConnection!.addTrack(track, stream));
                        this._localVideoRef.current!.srcObject = stream;    // 映像を表示
                        this.SendAnswerSDP(offer);                          // AnserSDPを送信
                    })
                    .catch(function (err) {
                        console.error(err);
                    });
                break;
            case 'answer':                                                  // 受け取り側 -> 呼び出し側のSDP
                let answer = new RTCSessionDescription(sdpObject);
                //setAnswer
                assert(this._peerConnection != null);
                this._peerConnection.setRemoteDescription(answer)           // 受信したSDPをRemoteDescription(相手側のSDP)に設定
                    .then(() => {
                        //this.AddIceCandidate();                             // 保管していたIceCandidateの追加
                        if (this._candidate) {                              // IceCandidateがあれば
                            this._signalClient.SendData(JSON.stringify({ type: 'candidate', ice: this._candidate }));   // 経路の候補を送信
                        }
                    })                     
                    .catch(err => console.error(err));                      // 失敗時
                break;
            case 'candidate':
                let candidate = new RTCIceCandidate(sdpObject.ice);
                if (!this._peerConnection) {
                    return;
                }
                if (!this._peerConnection.remoteDescription) {             // RemoteSDPができるまで追加できないので
                    this._iceCandidates.push(candidate);                   // 保管しておく
                    return;
                }
                this._peerConnection.addIceCandidate(candidate);           // IceCandidateをPeerConnectionに登録
                break;
            default:
                console.log("無効なメッセージです。");
                break;
        }
    }

    // -------------------------------------------------------------------------------
    //#region - SendOfferSDP：OfferSDPの作成と送信 (呼び出し側 -> 受け取り側)
    // -------------------------------------------------------------------------------
    private SendOfferSDP() {
        if (!this._peerConnection) {
            console.error('peerConnection が存在しません。');
            return;
        }
        this._peerConnection.createOffer()                                  // OfferSDPの作成
            .then(sdp => {                                                  // 成功時
                assert(this._peerConnection != null);
                return this._peerConnection!.setLocalDescription(sdp);      // 作成したSDPをローカルSDP(自身のSDP)として登録
            })
            .then(() => {                                                   // 成功時
                assert(this._peerConnection != null);
                console.log("local SDP送信", this._peerConnection!.localDescription);
                return this._signalClient.SendData(JSON.stringify(this._peerConnection!.localDescription)); // SDP送信
            })
            .catch(ex => {                                                 // エラー時
                console.error(ex);
            });
    }
    // -------------------------------------------------------------------------------
    //#region - SendAnswerSDP：AnswerSDPの作成と送信 (受け取り側 -> 呼び出し側)
    // -------------------------------------------------------------------------------
    private SendAnswerSDP = (offer: RTCSessionDescription) => {
        if (!this._peerConnection) {
            console.error('peerConnection が存在しません。');
            return;
        }
        this._peerConnection.setRemoteDescription(offer)                        // 受けっとったOfferSDPを相手のSDPとして登録
            .then(() => {                                                       // 成功時
                this.AddIceCandidate();                                         // 保管していたIceCandidateの追加
                this._peerConnection!.createAnswer()                            // AnswerSDPの作
                    .then(sdp => {                                              // 成功時
                        assert(this._peerConnection != null);
                        return this._peerConnection.setLocalDescription(sdp);   // 作成したSDPをローカルSDP(自身のSDP)として登録
                    })
                    .then(() => {                                               // 成功時
                        assert(this._peerConnection != null);
                        this._signalClient.SendData(JSON.stringify(this._peerConnection.localDescription));    // 自身のSDPを相手に送る
                    })
                    .catch(ex => {                                          // 例外発生時
                        console.error(ex);
                    });
            }
            );
    };
    // -------------------------------------------------------------------------------
    //#region - AddIceCandidate：保管していたIceCandidateの追加
    // -------------------------------------------------------------------------------
    private AddIceCandidate = () => {
        for (let i = 0; i < this._iceCandidates.length; i++) {
            this._peerConnection!.addIceCandidate(this._iceCandidates[i])
        }
        this._iceCandidates = [];
    }
}