#!/bin/bash

# 创建必要的目录
mkdir -p public/manifests public/icons temp downloads

# 设置权限
chmod -R 755 public
chmod -R 755 downloads

# 启动服务器
node server.js 