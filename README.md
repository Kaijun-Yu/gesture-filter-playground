# 手势滤镜游乐园

**漫画窗**是第一个试玩。对着摄像头伸出双手的拇指和食指，四个指尖围住的区域就会变成带描边和网点的漫画画面。不开摄像头也可以拖动示例画面的四个角。

## 本地启动

在仓库目录运行以下命令，需要 Node.js。

```sh
node server.mjs
```

打开 [首页](http://127.0.0.1:4177/)观看选区演示，或进入[试玩页](http://127.0.0.1:4177/play.html)。在线托管时，试玩页需要通过 HTTPS 访问才能使用摄像头。

画面在浏览器本地处理。MediaPipe Hand Landmarker 提供手部关键点，WebGL 负责滤镜渲染。仓库内包含运行所需的 WebAssembly 和模型文件，以及 [MediaPipe 许可证](vendor/LICENSE-mediapipe.txt)。示例画面由 ImageGen 生成，演示视频使用项目内的滤镜渲染。
