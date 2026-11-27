# 手势滤镜游乐园

## 星雪圣诞树

在 `christmastree` 分支运行 `node server.mjs 4178`，打开 [本地圣诞树试玩](http://127.0.0.1:4178/christmastree.html)。食指画圈会点亮圣诞树并转动镜头，张开手掌左右划动也能转动树景。手指合拢再张开会触发烟花和降雪。也可拖动场景点亮，再点击「撒花」。

**漫画窗**是第一个试玩。对着摄像头伸出双手的拇指和食指，四个指尖围住的区域就会变成带描边和网点的漫画画面。不开摄像头也可以拖动示例画面的四个角。

[直接试玩](https://kaijun-yu.github.io/gesture-filter-playground/play.html) · [观看演示](https://kaijun-yu.github.io/gesture-filter-playground/)

## 网站发布

GitHub Pages 从 `main` 分支的仓库根目录发布静态文件。推送到 `main` 后，Pages 会更新线上版本。主站的「开始试玩」按钮可链接至 [Pages 试玩页](https://kaijun-yu.github.io/gesture-filter-playground/play.html)。

## 本地开发调试

使用 Node.js 在仓库目录启动本地预览服务。

```sh
node server.mjs
```

打开 [本地首页](http://127.0.0.1:4177/)查看演示，或进入[本地试玩页](http://127.0.0.1:4177/play.html)调试。`server.mjs` 用于本地预览。线上由 GitHub Pages 托管，手势识别和滤镜都在访客的浏览器里运行。

## 技术与素材

MediaPipe Hand Landmarker 提供手部关键点，WebGL 负责滤镜渲染。仓库内包含所需的 WebAssembly、模型文件和 [MediaPipe 许可证](vendor/LICENSE-mediapipe.txt)。示例画面由 ImageGen 生成，演示视频使用项目内的滤镜渲染。
