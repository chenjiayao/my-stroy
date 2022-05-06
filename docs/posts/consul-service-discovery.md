---
title: Consul 的基本使用：服务注册和自动发现
date: 2022-04-28
categories:
 - Consul
 - 微服务
tags:
 - Consul

publish: false
---

写这篇 blog 的起因是公司开始尝试基于 consul 实践 service mesh，在不断学习过程中碰到一些有趣的问题，也发现这是一个庞大的知识体系，不是一些简单的个人笔记能归纳的，所以决定用 blog 这种公开的方式严谨的记录下来，提供给自己复习和有缘人。

本篇属于 consul 的入门教程，后续会延伸到 service mesh 等内容。


## 服务注册和自动发现

实际上，自从 docker 开始流行后，微服务以及微服务相关联的几个名词：「服务注册」、「自动发现」等已经被提及很多遍了，不过为了文章阅读的完整性，这里用我的理解解释下「服务注册」和「自动发现」。


从一开始，公司的某个项目只有一个仓库，所有的代码都在这个仓库中，随着业务发展代码越来越多，于是自然而然有人提出：我们把代码按照业务拆分成多个模块吧，然后通过 API 接口互相调用吧！这个想法就是微服务的概念：**将一个庞大的项目根据某些逻辑拆分成多个模块，每个模块之间通过 API 互相调用。**

相对于一个代码仓库而言，这种萌新的微服务具备一些优势：
1. 每个模块可以独立上线，尤其对于那种需要编译的语言，一个庞大的代码仓库编译需要很久的时间，拆分代码之后可以节省很多编译时间
2. 测试方便
3. 可以把「屎」和「巧克力」分开：项目代码中会存在一些糟糕但是可以运行的代码，那么可以考虑把这些「屎」代码独立成一个模块分离出来，保证代码可以运行，后续其他模块只需要通过 API 调用即可，不用关心代码的复杂逻辑。

> 关于第 3 点展开讲一下我对于「重构代码」的想法：在实际开发中，比较好的做法不是直接把糟糕的代码重写，而是尽量把糟糕的代码和良好的代码分开，让糟糕的代码可保持独立的逻辑运行，对外提供调用方式。而后在糟糕的代码中继续分离，直到消灭糟糕的代码。

![](https://raw.githubusercontent.com/chenjiayao/sidergo-posts/master/docs/images/20220429111015.png)

现在我们已经把代码划分成 3 个模块，由于服务之间需要通过 API 通信，于是我们会在模块的配置文件中添加每个模块的地址：

![](https://raw.githubusercontent.com/chenjiayao/sidergo-posts/master/docs/images/202204291119614.png)

到这里，我们已经成功在项目中实践微服务了！

不过，我们会碰到新的问题：

1. service A 的地址不是固定的，我们无法确定配置文件中 service_a_host` 的值。
2. 某个模块可能访问量特别大，导致该模块访问速度缓慢。

这 2 个不是我随便扯出来的问题，在微服务的实践中必然会碰到的。

为了解决上面的问题，有一个很好的思路：

1. 独立起一个「注册中心」的模块，每个模块在启动之后，都向注册中心报告自己的服务名称和访问地址，类似于 `service_name => service_host` 的 kv，其中服务名称可以自定义，并且全局唯一。
2. 当 A service 要请求 B service 接口时，拿着 B service 的服务名称询问注册中心：B service 的访问地址是多少，注册中心返回该地址，A service 就可以通过该地址访问 B service。


第 1 点提到的「每个模块在启动之后，都向注册中心报告自己的服务名称和访问地址」就是我们所说的「服务注册」。第 2 点通过注册中心获取到其他服务的地址就是「自动发现」。

现在我们明白了什么是服务注册和自动发现，这两个组合在一起**解决了微服务中各个模块无法相互访问的问题。**


## 在 Consul 中实践服务注册和自动发现

上面解释服务注册和自动发现的时候，提到了「注册中心」。[Consul](https://consul.io/) 在这里就是扮演注册中心的角色。除了 Consul，还有很多其他框架，比如：istio、Eureka、Zookeeper 等等都可以作为注册中心。

下面我们开始基于 Consul 来手动实践下。


### Consul 的基本概念

Consul 使用 Go 开发，这意味着只需要一个 bin 文件就可以使用了，不过后续我们还是会使用 docker 来实践。

Consul 中有两个角色：
1. server
2. client

代入到上面的描述，server 是上面提到的注册中心，而 client 会将微服务模块的访问地址上报给 server。这样 consul 就满足我们对于微服务的基本需求。

由于所有的模块都需要和注册中心通信，所以注册中心变得非常重要，如果注册中心挂了，整个系统就挂了。consul 为了保证 server 的稳定性，支持 server 以集群的模式部署，以 raft 协议从所有的 server 中选举 leader。不过我们目前不会深入集群模式，新手任务不要过早去打 raft 这个怪。😂

此外，consul 还有 datacenter 的概念，对于超大型系统而言，会在北京和广州各部署一套 consul 集群，这样就有了两个 consul datacenter，两个 datacenter 通过网络互通。


### Consul 上手实践

了解上面的概念之后，就足够我们操作 consul 了

1. 以 server 角色启动一个 consul：
```bash
// --server=true 表示以 server 启动 consul
// --bootstrap-expect=1 表示集群中需要启动了多少个 server 整个集群才算启动成功，这里我们设置为 1 即可。
docker run -d --name=consul-server -p 8500:8500 consul agent --server=true --bootstrap-expect=1  --client=0.0.0.0 -ui
```


2. 执行 `docker inspect consul-server | grep IP` 获取到 consul-server 的 IP
```bash
❯ docker inspect consul1  |grep IP
            "LinkLocalIPv6Address": "",
            "LinkLocalIPv6PrefixLen": 0,
            "SecondaryIPAddresses": null,
            "SecondaryIPv6Addresses": null,
            "GlobalIPv6Address": "",
            "GlobalIPv6PrefixLen": 0,
            "IPAddress": "172.17.0.2",
            "IPPrefixLen": 16,
            "IPv6Gateway": "",
                    "IPAMConfig": null,
                    "IPAddress": "172.17.0.2",  //consul-server 的 IP 地址
                    "IPPrefixLen": 16,
                    "IPv6Gateway": "",
                    "GlobalIPv6Address": "",
                    "GlobalIPv6PrefixLen": 0,
```
3. 以 client 角色启动另一个 consul，并连接到 consul-server

```bash
docker run --name=consule-client -d consul agent  -join=172.17.0.2
```

执行成功后，可以通过 http://localhost:8500 访问 consul

![](https://raw.githubusercontent.com/chenjiayao/sidergo-posts/master/docs/images/202204291625193.png)

除了 web ui，也可以通过命令行查看信息：

```bash
docker exec -it consul-server sh
consul members

Node          Address          Status  Type    Build   Protocol  DC   Partition  Segment
f6e25729245f  172.17.0.2:8301  alive   server  1.11.4  2         dc1  default    <all>
7f45cf74e866  172.17.0.3:8301  alive   client  1.11.4  2         dc1  default    <default>
```
Type 字段用于区分 consul 角色。

了解了 consul 的启动操作，现在我们模拟两个服务，来实践下服务注册和服务发现。