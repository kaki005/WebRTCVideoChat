import assert from 'assert'
export default class SignalingClient {
    _connection: WebSocket | null = null;          // シグナリングを行うWebSocketのconnection
    get Socket(): WebSocket {
        assert(this._connection != null);
        return this._connection;
    };

    Connect() {
        const ConnServerURL: string = "wss://wvzxisxtgc.execute-api.ap-northeast-1.amazonaws.com/production";
        this._connection = new WebSocket(ConnServerURL);
        this._connection.onopen = (event) => {
            console.log("コネクション確立1");
        };
        //エラー発生
        this._connection.onerror = function (error) {
            console.error("接続エラー発生!");
            console.log(error);
        };
        //切断
        this._connection.onclose = function () {
            console.log("コネクション切断");
        };
    }

    Close = () => {
        this._connection?.close();
        this._connection = null;
    }


    SendData = (message: string): void => {
        if (this._connection == null) {
            console.log("シグナリングサーバとの接続がnullです。");
            return;
        }
        var message = JSON.stringify({ action: "sendmessage", "message":  message});
        this._connection.send(message);
    };


   
}