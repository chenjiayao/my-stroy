---
title: Golang 限流和限速
date: 2022-06-28
categories:
 - Golang
tags:
 - Golang

publish: true
---


本篇文章介绍 go 中限流和限速的实现，主要的算法使用到令牌桶，但是本篇文章不会介绍令牌桶算法，默认你已经明白令牌桶的原理。

## 限流

限流是后台系统中常见的一个需求，最简单的是根据 IP 地址对请求频率做一个限制，使用 [time/rate](https://pkg.go.dev/golang.org/x/time/rate) 包可以很容易实现这个需求。

```golang
type IPLimit struct {
	mutex   sync.Mutex
	iprates map[string]*rate.Limiter
}

var limiter *IPLimit

func init() {
	limiter = &IPLimit{
		iprates: make(map[string]*rate.Limiter),
	}
}
```
为了实现根据 IP 限流，需要一个 map 结构来保存 IP 和 rate.Limiter 的关系，接下来我们就一个在 middleware 中使用了：

```golang
func IPLimitRaterMiddleware(c *gin.Context) {

	ip := c.ClientIP()
	
    limiter.mutex.Lock()
	defer limiter.mutex.Unlock()

	l, ok := limiter.iprates[ip]
	if !ok {
		l = rate.NewLimiter(1, 10)
		limiter.iprates[ip] = l
	}

	if !l.Allow() {
		c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
			"message": "too many requests",
		})
		return
	}
	c.Next()
}
```

这里 `l.Allow()` 是关键，如果请求频率已经超过令牌桶设置的频率，那么 `Allow()` 返回 false，根据这个返回值就可以返回 429 了。

使用 time/rate 包实现限流很简单，但是上面的做法是有缺陷的：**所有的请求都需要争 IPLimit 的锁。** 在这里我们用 map 保存 IP 地址和令牌桶的关系，但是由于 map 不支持并发读写，所以在读写之前需要使用 sync.Mutex 锁住 map，这使得这里的代码会成为一个瓶颈。如果要提高性能，应该将这里的 map 改成 sync.Map 等支持并发读写的 map，或者使用 redis 来实现限流



## 限速

go 中的限速是指在使用 gin 之类的 http server 下载文件，希望服务端可以控制下载速度。 其实，go 限流的实现在网上可以看到很多讲解，但是关于限速的实现却很少。

如何实现限速，这个需求看似很接近限流，但是具体事项起来却比较不好下手，这里我们先不管限速，来看看使用 gin 如何实现下载文件。

```golang
r.GET("/download_1", func(c *gin.Context) {
		//RandStringBytesMaskImprSrc 函数可以生成一个指定大小的 []byte，这里生成的是一个 10MB 的 []byte
		b := RandStringBytesMaskImprSrc(10 * 1024 * 1024)
		buf := bytes.NewBuffer(b)
		c.Header("Content-Length", fmt.Sprintf("%d", len(b)))
		c.Header("Content-disposition", "attachment;filename=download")
		io.Copy(c.Writer, buf)
	})
```
上面几行代码就可以实现下载功能了，请求 `/download_1` 可以下载一个 download 的文件，可以看到下载的主要逻辑是：`io.Copy(c.Writer, buf)`，`c.Writer` 为 http 请求代表的 socket，这里看到下载的本质是将流写到 `c.Writer` 中。那么如果我们现在写入的速度，就可以做到限速：

```golang
b := RandStringBytesMaskImprSrc(10 * 1024 * 1024)
buf := bytes.NewBuffer(b)
c.Header("Content-Length", fmt.Sprintf("%d", len(b)))
c.Header("Content-disposition", "attachment;filename=download")

//每秒写 10*1024 byte 到 c.Writer
for range time.Tick(1 * time.Second) {
	_, err := io.CopyN(c.Writer, buf, 10*1024) //10KB/s
	if err == io.EOF {
		break
	}
}
```
这里每隔 1s 往 `c.Writer` 写入 10KB/s 的数据，这样下载速率就可以控制在 10KB/s 了。


除了使用 `time.Tick` 之外，同样也可以使用令牌桶算法来实现限速

```golang
type LimitReader struct {
	r       io.Reader
	limiter *rate.Limiter
	ctx     context.Context
}

const burstLimit = 1000 * 1000 * 1000

func NewLimitReader(r io.Reader) *LimitReader {
	return &LimitReader{
		r:   r,
		ctx: context.Background(),
	}
}

func (s *LimitReader) SetRateLimit(bytesPerSec float64) {
	s.limiter = rate.NewLimiter(rate.Limit(bytesPerSec), burstLimit)
	s.limiter.AllowN(time.Now(), burstLimit)
}

func (s *LimitReader) Read(p []byte) (int, error) {
	if s.limiter == nil {
		return s.r.Read(p)
	}
	n, err := s.r.Read(p)
	if err != nil {
		return n, err
	}
	//当读取的速率超过令牌桶设置的速率，会阻塞在 WaitN 
	if err := s.limiter.WaitN(s.ctx, n); err != nil {
		return n, err
	}
	return n, nil
}
```

```golang
r.GET("/download_2", func(c *gin.Context) {
	b := RandStringBytesMaskImprSrc(10 * 1024 * 1024)
	buf := bytes.NewBuffer(b)
	c.Header("Content-Length", fmt.Sprintf("%d", len(b)))
	c.Header("Content-disposition", "attachment;filename=download")

	lr := flowlimit.NewLimitReader(buf)
	lr.SetRateLimit(10 * 1024) //设置下载速率
	io.Copy(c.Writer, lr)
})
```

上面就是使用令牌桶做限速的逻辑了，这里我们对 reader 做了封装，`io.Copy` 会调用 `LimitReader` 的 `Read` 函数读取数据，这里我们在 `Read` 中使用令牌桶做了限制：如果读取速率超过令牌桶的速率，那么就会阻塞在 `WaitN`，这样就实现了限速的功能。

