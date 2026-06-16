"use strict";

// LINEとやり取りするための道具
const line = require("@line/bot-sdk");
// 外部のAPI(銀行など)と通信するための道具
const request = require("request");

// LINEの認証情報(Lambdaの環境変数から取得)
const config = {
  channelAccessToken: process.env.channelAccessTokenLINE,
  channelSecret: process.env.channelSecretLINE,
};

// LINEに返信するためのクライアント
const client = new line.messagingApi.MessagingApiClient(config);

// sunabar(銀行API)のアクセストークン(環境変数から取得)
const sunabarToken = process.env.sunabarToken;

// LINEからメッセージが届いたときに実行される関数
exports.handler = async (event) => {
  // LINEから送られてきたデータを取り出す
  const body = JSON.parse(event.body);

  // 返信先を特定するためのトークン
  const replyToken = body.events[0].replyToken;
  // ユーザーが送ってきた文章
  const reqMessage = body.events[0].message.text;

  // 返信メッセージを入れる変数(最初は空)
  let resMessage = "";

  // 「点」という文字が含まれていたら、テストの点数とみなす
  if (reqMessage.includes("点")) {
    // ★Aさん担当: 点数を取り出して、ボーナス金額を判定する処理
    // ★Cさん担当: ボーナス金額が決まったら、sunabarの振込APIを呼び出す処理
  } else if (reqMessage === "残高") {
    // ★Bさん担当: sunabarの残高照会APIを呼び出して、残高を返す処理
  }

  // LINEに返信を送る
  await client.replyMessage({
    replyToken,
    messages: [{ type: "text", text: resMessage }],
  });
};
