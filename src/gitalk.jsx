import React, { Component } from 'react'
import FlipMove from 'react-flip-move'
import autosize from 'autosize'
import cache from './web/cache'

import i18n from './i18n'
import './style/index.styl'
import {
  queryParse,
  queryStringify,
  getMetaContent,
  formatErrorMsg,
  hasClassInParent
} from './util'

import { client as axiosGithub } from './web/client/web-client'
import Avatar from './component/avatar'
import Button from './component/button'
import Action from './component/action'
import Comment from './component/comment'
import Svg from './component/svg'
import { 
  GT_ACCESS_TOKEN, 
  GT_VERSION, 
  GT_COMMENT,
  GT_ANONYMOUS_NAME,
  GT_CACHE_KEY_COMMENT, 
  ONE_DAY
} from './const'
import QLGetComments from './graphql/getComments'
import { 
  getUsername,
  parseBody,
  getCommentCount,
  updateCommentCount 
} from './utils/comment'

class GitalkComponent extends Component {
  state = {
    user: null,
    issue: null,
    comments: [],
    localComments: [],
    comment: '',
    page: 1,
    pagerDirection: 'last',
    cursor: null,
    previewHtml: '',
    anonymousName: '',

    isNoInit: false,
    isIniting: true,
    isCreating: false,
    isLoading: false,
    isLoadMore: false,
    isLoadOver: false,
    isIssueCreating: false,
    isPopupVisible: false,
    isInputFocused: false,
    isPreview: false,

    isOccurError: false,
    errorMsg: '',
  }

  constructor (props) {
    super(props)
    this.options = Object.assign({}, {
      server: {
        oauth_api: '',
        anonymous_api: '',
      },
      anonymous: {
        accountName: '', //will replace to anonymous
      },
      cache: {
        comments: {
          enable: true,
          ttl: 600
        },
        userInfo: {
          enable: true,
          ttl: 3600
        },
        issue: {
          enable: true,
          ttl: -1
        }
      },
      id: window.location.href,
      number: -1,
      labels: ['Gitalk'],
      title: window.document.title,
      body: '', // window.location.href + header.meta[description]
      language: window.navigator.language || window.navigator.userLanguage,
      perPage: 10,
      pagerDirection: 'last', // last or first
      createIssueManually: false,
      distractionFreeMode: false,
      proxy: '',
      flipMoveOptions: {
        staggerDelayBy: 150,
        appearAnimation: 'accordionVertical',
        enterAnimation: 'accordionVertical',
        leaveAnimation: 'accordionVertical',
      },
      enableHotKey: true,

      url: window.location.href,

      defaultAuthor: {
        avatarUrl: '//avatars1.githubusercontent.com/u/29697133?s=50',
        login: 'null',
        url: '',
      },

      updateCountCallback: null
    }, props.options)

    this.state.pagerDirection = this.options.pagerDirection
    const storedComment = window.localStorage.getItem(GT_COMMENT)
    if (storedComment) {
      this.state.comment = decodeURIComponent(storedComment)
      window.localStorage.removeItem(GT_COMMENT)
    }

    window.GT_PROXY = this.options.proxy

    const query = queryParse()
    if (query.access_token) {
      this.accessToken = query.access_token
      delete query.access_token
      const replacedUrl = `${window.location.origin}${window.location.pathname}${queryStringify(query)}${window.location.hash}`
      history.replaceState(null,null,replacedUrl)
    }

    this.getInit()
      .then(() => {
        const name = localStorage.getItem(GT_ANONYMOUS_NAME)
        if (!this.user && name) {
          this.setState({
            anonymousName: name,
            isIniting: false
          })
          return
        }
        this.setState({ isIniting: false })
      })
      .catch(err => {
        console.log('err:', err)
        this.setState({
          isIniting: false,
          isOccurError: true,
          errorMsg: formatErrorMsg(err)
        })
      })

    this.i18n = i18n(this.options.language)
  }

  componentDidUpdate () {
    this.commentEL && autosize(this.commentEL)
  }

  get accessToken () {
    return this._accessToke || window.localStorage.getItem(GT_ACCESS_TOKEN)
  }
  set accessToken (token) {
    window.localStorage.setItem(GT_ACCESS_TOKEN, token)
    this._accessToken = token
  }
  get loginLink () {
    const githubOauthUrl = this.options.server.oauth_api
    const query = {
      origin: window.location.href
    }
    return `${githubOauthUrl}?${queryStringify(query)}`
  }
  get isAdmin () {
    const { admin } = this.options
    const { user } = this.state

    return user && ~[].concat(admin).map(a => a.toLowerCase()).indexOf(user.login.toLowerCase())
  }

  getInit () {
    return this.getUserInfo().then(() => this.getIssue()).then(issue => this.getComments(issue))
  }
  getUserInfo () {
    if (!this.accessToken) {
      return new Promise(resolve => {
        resolve()
      })
    }
    return axiosGithub.get('/user', {
      headers: {
        Authorization: `token ${this.accessToken}`
      },
      cache: this.options.cache.userInfo || {enable: true,ttl: 3600}
    }).then(res => {
      this.setState({ user: res.data })
    }).catch(err => {
      this.logout()
    })
  }
  getIssueById () {
    const { owner, repo, number, clientID, clientSecret } = this.options
    const getUrl = `/repos/${owner}/${repo}/issues/${number}`

    return new Promise((resolve, reject) => {
      axiosGithub.get(getUrl, {
        params: {
          t: Date.now()
        },
        cache: this.options.cache.issue || {enable: true,ttl: -1}
      })
        .then(res => {
          let issue = null

          if (res && res.data && res.data.number === number) {
            issue = res.data

            this.setState({ issue, isNoInit: false })
          }
          resolve(issue)
        })
        .catch(err => {
          // When the status code is 404, promise will be resolved with null
          if (err.response.status === 404) resolve(null)
          reject(err)
        })
    })
  }
  getIssueByLabels () {
    let { owner, repo, id, labels, clientID, clientSecret } = this.options
    const url = `/repos/${owner}/${repo}/issues`

    return axiosGithub.get(url, {
      params: {
        labels: labels.concat(id).join(','),
        t: Date.now()
      },
      proxy: true,
      cache: this.options.cache.issue || {enable: true,ttl: -1}
    }).then(res => {
      const { createIssueManually } = this.options
      let isNoInit = false
      let issue = null
      if (!(res && res.data && res.data.length)) {
        if (!createIssueManually && this.isAdmin) {
          return this.createIssue()
        }

        isNoInit = true
      } else {
        issue = res.data[0]
      }
      this.setState({ issue, isNoInit })
      return issue
    })
  }
  getIssue () {
    const { number } = this.options
    const { issue } = this.state

    let result;
    if (issue) {
      this.setState({ isNoInit: false })
      result = Promise.resolve(issue)
    } else if (typeof number === 'number' && number > 0) {
      return this.getIssueById().then(resIssue => {
        if (!resIssue) return this.getIssueByLabels()
        result = Promise.resolve(resIssue)
      })
    } else {
      result = this.getIssueByLabels()
    }

    return result.then(data => {
      updateCommentCount(data.id,data.comments)
      return Promise.resolve(data)
    })
  }
  createIssue () {
    const { owner, repo, title, body, id, labels, url } = this.options
    return axiosGithub.post(`/repos/${owner}/${repo}/issues`, {
      title,
      labels: labels.concat(id),
      body: body || `${url} \n\n ${
        getMetaContent('description') ||
        getMetaContent('description', 'og:description') || ''
      }`
    }, {
      headers: {
        Authorization: `token ${this.accessToken}`
      }
    }).then(res => {
      this.setState({ issue: res.data })
      return res.data
    })
  }
  // Get comments via v3 api, don't require login, but sorting feature is disable
  getCommentsV3 = issue => {
    const { clientID, clientSecret, perPage } = this.options
    const { page } = this.state

    const cacheKey = `${GT_CACHE_KEY_COMMENT}_${this.options.id}_${page}`
    const cacheInfo = Object.assign(
      this.options.cache.comments || 
      { enable: true, ttl: 600 },{ cacheKey }
    )

    return this.getIssue()
      .then(issue => {
        if (!issue) return
        return axiosGithub.get(issue.comments_url, {
          headers: {
            Accept: 'application/vnd.github.v3.full+json'
          },
          params: {
            per_page: perPage,
            page,
            sort: 'comments',
            direction: this.state.pagerDirection === 'last' ? 'asc' : 'desc'
          },
          proxy: true,
          cache: cacheInfo
        }).then(res => {
          const { comments, issue } = this.state
          let isLoadOver = false
          const listComments = res.data
          const cs = comments.concat(listComments)
          const length = listComments.length || 0
          if (length === 0 || length < perPage) {
            isLoadOver = true
            updateCommentCount(issue.id,cs.length)
          }
          
          const count = cs.length
          if (count > getCommentCount(issue.id)) {
            updateCommentCount(issue.id,cs.length)
          }

          if (length === perPage) {
            cache.save(cacheKey,listComments,ONE_DAY * 7)
          }

          // invalid in cache mode
          // if (cs.length >= issue.comments || res.data.length < perPage) {
          //   isLoadOver = true
          // }
          this.setState({
            comments: cs,
            isLoadOver,
            page: page + 1
          })
          return cs
        })
        .catch(err => {
          this.setState({ 
            isLoading: false,
            isOccurError: true,
            errorMsg: formatErrorMsg(err)
          })
        })
      })
  }
  getComments (issue) {
    if (!issue) return
    // Get comments via v4 graphql api, login required and sorting feature is available
    // if (this.accessToken) return QLGetComments.call(this, issue)
    return this.getCommentsV3(issue)
  }
  createComment (accessToken) {
    const { comment, localComments, comments } = this.state

    return this.getIssue()
      .then(issue => {
        axiosGithub.post(issue.comments_url, {
          body: comment
        }, {
          headers: {
            Accept: 'application/vnd.github.v3.full+json',
            Authorization: `token ${accessToken}`
          }
        })
      })
      .then(res => {
        const { issue } = this.state
        updateCommentCount(issue.id,getCommentCount(issue.id) + 1)
        this.removeCommentCache();
        this.setState({
          comment: '',
          comments: comments.concat(res.data),
          localComments: localComments.concat(res.data)
        })
      })
  }
  
  removeCommentCache() {
    const cacheKeyPrefix = `${GT_CACHE_KEY_COMMENT}_${this.options.id}`
    cache.removeByPrefix(cacheKeyPrefix)
  }

  createAnonmouslyComment(comment) {
    const { localComments, comments } = this.state
    return this.getIssue()
          .then(issue => this.submitAnonmouslyComment(issue.comments_url,comment))
          .then(res => {
            const { issue } = this.state
            updateCommentCount(issue.id,getCommentCount(issue.id) + 1)
            this.setState({
              comment: '',
              comments: comments.concat(res.data),
              localComments: localComments.concat(res.data)
            })
          })
  }

  submitAnonmouslyComment(postUrl,body) {
    //use urlencode to avoid preflight request
    const params = `postUrl=${encodeURIComponent(postUrl)}&content=${body}`
    const url = this.options.server.anonymous_api
    return axiosGithub.post(url,params,{
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }).then(res => {
      this.removeCommentCache()
      return Promise.resolve(res)
    })
  }

  logout () {
    this.setState({ user: null })
    window.localStorage.removeItem(GT_ACCESS_TOKEN)
  }
  getRef = e => {
    this.publicBtnEL = e
  }
  reply = replyComment => () => {
    const { comment } = this.state
    const { accountName } = this.options.anonymous
    const username = replyComment.user.login

    const replyCommentBody = parseBody(replyComment,this.options.anonymous.accountName)
    let replyCommentArray = replyCommentBody.split('\n')
    replyCommentArray = replyCommentArray.map(t => `> ${t}`)

    let author = ''
    if (accountName !== username) {
      author = replyComment.user.login
    } else {
      author = getUsername(replyComment,this.options.anonymous,this.i18n)
    }

    author = `> [at: ${author}](#${replyComment.id})   `
    replyCommentArray.unshift(author)

    replyCommentArray.push('')
    replyCommentArray.push('')
    if (comment) replyCommentArray.unshift('')
    this.setState({ comment: comment + replyCommentArray.join('\n') }, () => {
      autosize.update(this.commentEL)
      this.commentEL.focus()
    })
  }
  like (comment) {
    const { owner, repo } = this.options
    const { user } = this.state
    let { comments } = this.state

    axiosGithub.post(`/repos/${owner}/${repo}/issues/comments/${comment.id}/reactions`, {
      content: 'heart'
    }, {
      headers: {
        Authorization: `token ${this.accessToken}`,
        Accept: 'application/vnd.github.squirrel-girl-preview'
      }
    }).then(res => {
      comments = comments.map(c => {
        if (c.id === comment.id) {
          if (c.reactions) {
            if (!~c.reactions.nodes.findIndex(n => n.user.login === user.login)) {
              c.reactions.totalCount += 1
            }
          } else {
            c.reactions = { nodes: [] }
            c.reactions.totalCount = 1
          }

          c.reactions.nodes.push(res.data)
          c.reactions.viewerHasReacted = true
        }
        return c
      })

      this.setState({
        comments
      })
    })
  }
  unLike (comment) {
    const { user } = this.state
    let { comments } = this.state

    // const {  user } = this.state
    // let id
    // comment.reactions.nodes.forEach(r => {
    //   if (r.user.login = user.login) id = r.databaseId
    // })
    // return axiosGithub.delete(`/reactions/${id}`, {
    //   headers: {
    //     Authorization: `token ${this.accessToken}`,
    //     Accept: 'application/vnd.github.squirrel-girl-preview'
    //   }
    // }).then(res => {
    //   console.log('res:', res)
    // })

    const getQL = id => ({
      operationName: 'RemoveReaction',
      query: `
          mutation RemoveReaction{
            removeReaction (input:{
              subjectId: "${id}",
              content: HEART
            }) {
              reaction {
                content
              }
            }
          }
        `
    })

    axiosGithub.post('/graphql', getQL(comment.gId), {
      headers: {
        Authorization: `bearer ${this.accessToken}`
      }
    }).then(res => {
      if (res.data) {
        comments = comments.map(c => {
          if (c.id === comment.id) {
            const index = c.reactions.nodes.findIndex(n => n.user.login === user.login)
            if (~index) {
              c.reactions.totalCount -= 1
              c.reactions.nodes.splice(index, 1)
            }
            c.reactions.viewerHasReacted = false
          }
          return c
        })

        this.setState({
          comments
        })
      }
    })
  }


  handlePopup = e => {
    e.preventDefault()
    e.stopPropagation()
    const isVisible = !this.state.isPopupVisible
    const hideHandle = e1 => {
      if (hasClassInParent(e1.target, 'gt-user', 'gt-popup')) {
        return
      }
      window.document.removeEventListener('click', hideHandle)
      this.setState({ isPopupVisible: false })
    }
    this.setState({ isPopupVisible: isVisible })
    if (isVisible) {
      window.document.addEventListener('click', hideHandle)
    } else {
      window.document.removeEventListener('click', hideHandle)
    }
  }
  handleLogin = () => {
    const { comment } = this.state
    window.localStorage.setItem(GT_COMMENT, encodeURIComponent(comment))
    window.location.href = this.loginLink
  }
  clearPageCache() {
    cache.clear(location.pathname)
    alert('successful')
  }
  handleIssueCreate = () => {
    this.setState({ isIssueCreating: true })
    this.createIssue().then(issue => {
      this.setState({
        isIssueCreating: false,
        isOccurError: false
      })
      return this.getComments(issue)
    }).catch(err => {
      this.setState({
        isIssueCreating: false,
        isOccurError: true,
        errorMsg: formatErrorMsg(err)
      })
    }).then(res => {
      if (res) {
        this.setState({
          isNoInit: false,
        })
      }
    })
  }
  handleCommentCreate = e => {
    if (!this.state.comment.length) {
      e && e.preventDefault()
      this.commentEL.focus()
      return
    }
    this.setState(state => {
      if (state.isCreating) return

      this.createComment(this.accessToken)
        .then(() => this.setState({
          isCreating: false,
          isOccurError: false
        }))
        .catch(err => {
          this.setState({
            isCreating: false,
            isOccurError: true,
            errorMsg: formatErrorMsg(err)
          })
        })
      return { isCreating: true }
    })
  }
  
  handleAnonCommentCreate = e => {
    if (this.state.comment.length < 4) {
      alert('请至少输入4个字符')
      e && e.preventDefault()
      return
    }

    let { anonymousName,comment } = this.state
    if (anonymousName) {
      comment = `<!-- ${anonymousName} -->\n${comment}`
      localStorage.setItem(GT_ANONYMOUS_NAME,anonymousName)
    }

    this.setState({ isCreating: true })
    this.createAnonmouslyComment(comment)
      .then(() => this.setState({
        isCreating: false,
        isOccurError: false
      }))
      .catch(err => {
        this.setState({
          isCreating: false,
          isOccurError: true,
          errorMsg: formatErrorMsg(err)
        })
      })
  }
  handleCommentPreview = e => {
    this.setState({
      isPreview: !this.state.isPreview
    })

    // let accessToken = this.accessToken;
    axiosGithub.post('/markdown', {
      text: this.state.comment
    }, {
      headers: { 
        Accept: "application/vnd.github.v3+json",
        'Content-Type': 'application/json'
      },
      cache: {
        enable: false
      }
    }).then(res => {
      this.setState({
        previewHtml: res.data
      })
    }).catch(err => {
      this.setState({
        isOccurError: true,
        errorMsg: formatErrorMsg(err)
      })
    })
  }
  handleCommentLoad = () => {
    const { issue, isLoadMore } = this.state
    if (isLoadMore) return
    this.setState({ isLoadMore: true })
    this.getComments(issue).then(() => this.setState({ isLoadMore: false }))
  }
  handleCommentChange = e => this.setState({ comment: e.target.value })
  handleAnonymousNameChange = e => this.setState({ anonymousName: e.target.value })
  handleLogout = () => {
    this.logout()
    window.location.reload()
  }
  handleCommentFocus = e => {
    const { distractionFreeMode } = this.options
    if (!distractionFreeMode) return e.preventDefault()
    this.setState({ isInputFocused: true })
  }
  handleCommentBlur = e => {
    const { distractionFreeMode } = this.options
    if (!distractionFreeMode) return e.preventDefault()
    this.setState({ isInputFocused: false })
  }
  handleSort = direction => e => {
    this.setState({pagerDirection: direction})
  }
  handleCommentKeyDown = e => {
    const { enableHotKey } = this.options
    if (enableHotKey && (e.metaKey || e.ctrlKey) && e.keyCode === 13) {
      this.publicBtnEL && this.publicBtnEL.focus()
      this.handleCommentCreate()
    }
  }

  initing () {
    return <div className="gt-initing">
      <i className="gt-loader"/>
      <p className="gt-initing-text">{this.i18n.t('init')}</p>
    </div>
  }
  noInit () {
    const { user, isIssueCreating } = this.state
    const { owner, repo, admin } = this.options
    return (
      <div className="gt-no-init" key="no-init">
        <p dangerouslySetInnerHTML={{
          __html: this.i18n.t('no-found-related', {
            link: `<a href="https://github.com/${owner}/${repo}/issues">Issues</a>`
          })
        }}/>
        <p>{this.i18n.t('please-contact', { user: [].concat(admin).map(u => `@${u}`).join(' ') })}</p>
        {this.isAdmin ? <p>
          <Button onClick={this.handleIssueCreate} isLoading={isIssueCreating} text={this.i18n.t('init-issue')} />
        </p> : null}
        {!user && <Button className="gt-btn-login" onClick={this.handleLogin} text={this.i18n.t('login-with-github')} />}
      </div>
    )
  }

  header () {
    const { user, comment, isCreating, previewHtml, isPreview } = this.state
    return (
      <div>
        {!user && <div className="gt-header-anon-user-name">
            <input 
              type="text"
              value={this.state.anonymousName}
              onChange={this.handleAnonymousNameChange}
              placeholder='Anonymous name' 
              className="gt-header-anon-input"></input>
        </div>}
        <div className="gt-header" key="header">
        {user ?
          <Avatar className="gt-header-avatar" src={user.avatar_url} alt={user.login} /> :
          <a className="gt-avatar-github" onClick={this.handleLogin}>
            <Svg className="gt-ico-github" name="github"/>
          </a>
        }
        <div className="gt-header-comment">
          <textarea
            ref={t => { this.commentEL = t }}
            className={`gt-header-textarea ${isPreview ? 'hide' : ''}`}
            value={comment}
            onChange={this.handleCommentChange}
            onFocus={this.handleCommentFocus}
            onBlur={this.handleCommentBlur}
            onKeyDown={this.handleCommentKeyDown}
            placeholder={this.i18n.t('leave-a-comment')}
          />
          <div
            className={`gt-header-preview markdown-body ${isPreview ? '' : 'hide'}`}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
          <div className="gt-header-controls">
            <a className="gt-header-controls-tip" href="https://guides.github.com/features/mastering-markdown/" target="_blank">
              <Svg className="gt-ico-tip" name="tip" text={this.i18n.t('support-markdown')}/>
            </a>

            {user && <Button
              getRef={this.getRef}
              className="gt-btn-public"
              onClick={this.handleCommentCreate}
              text={this.i18n.t('comment')}
              isLoading={isCreating}
            />}

            {this.options.server.anonymous_api && <Button
              getRef={this.getRef}
              className="gt-btn-public"
              onMouseDown={this.handleAnonCommentCreate}
              text={this.i18n.t('anonymously-comment')}
              isLoading={isCreating}
            />}

            {<Button
              className="gt-btn-preview"
              onClick={this.handleCommentPreview}
              text={isPreview ? this.i18n.t('edit') : this.i18n.t('preview')}
              // isLoading={isPreviewing}
            />}


            {!user && <Button className="gt-btn-login" onClick={this.handleLogin} text={this.i18n.t('login-with-github')} />}
          </div>
        </div>
      </div>
      </div>
    )
  }
  comments () {
    const { user, comments, isLoadOver, isLoadMore, pagerDirection } = this.state
    const { language, flipMoveOptions, admin,anonymous } = this.options
    const totalComments = comments.concat([])
    // if (pagerDirection === 'last' && this.accessToken) {
    //   totalComments.reverse()
    // }
    return (
      <div className="gt-comments" key="comments">
        {/* <FlipMove {...flipMoveOptions}> */}
          {totalComments.map(c => (
            <Comment
              comment={c}
              key={c.id}
              user={user}
              language={language}
              commentedText={this.i18n.t('commented')}
              admin={admin}
              replyCallback={this.reply(c)}
              likeCallback={c.reactions && c.reactions.viewerHasReacted ? this.unLike.bind(this, c) : this.like.bind(this, c)}
              anonymous={anonymous}
            />
          ))}
        {/* </FlipMove> */}
        {!totalComments.length && <p className="gt-comments-null">{this.i18n.t('first-comment-person')}</p>}
        {(!isLoadOver && totalComments.length) ? <div className="gt-comments-controls">
          <Button className="gt-btn-loadmore" onClick={this.handleCommentLoad} isLoading={isLoadMore} text={this.i18n.t('load-more')} />
        </div> : null}
      </div>
    )
  }
  meta () {
    const { user, issue, isPopupVisible, pagerDirection, localComments } = this.state
    const cnt = issue ? getCommentCount(issue.id) : 0
    const isDesc = pagerDirection === 'last'
    // const { updateCountCallback } = this.options

    // // window.GITALK_COMMENTS_COUNT = cnt
    // if (
    //   updateCountCallback &&
    //   {}.toString.call(updateCountCallback) === '[object Function]'
    // ) {
    //   try {
    //     updateCountCallback(cnt)
    //   } catch (err) {
    //     console.log('An error occurred executing the updateCountCallback:', err)
    //   }
    // }

    return (
      <div className="gt-meta" key="meta" >
        <span className="gt-counts" dangerouslySetInnerHTML={{
          __html: this.i18n.t('counts', {
            counts: `<a class="gt-link gt-link-counts">${cnt}</a>`,
            smart_count: cnt
          })
        }}/>
        {isPopupVisible &&
          <div className="gt-popup">
            {user ? <Action className={`gt-action-sortasc${!isDesc ? ' is--active' : ''}`} onClick={this.handleSort('first')} text={this.i18n.t('sort-asc')}/> : null }
            {user ? <Action className={`gt-action-sortdesc${isDesc ? ' is--active' : ''}`} onClick={this.handleSort('last')} text={this.i18n.t('sort-desc')}/> : null }
            {user ?
              <Action className="gt-action-logout" onClick={this.handleLogout} text={this.i18n.t('logout')}/> :
              <a className="gt-action gt-action-login" onClick={this.handleLogin}>{this.i18n.t('login-with-github')}</a>
            }
            <a className="gt-action" onClick={this.clearPageCache}>{this.i18n.t('clear-cache')}</a>
            <div className="gt-copyright">
              <a className="gt-link gt-link-project" href="https://github.com/gitalk/gitalk" target="_blank">Gitalk</a>
              <span className="gt-version">{GT_VERSION}</span>
            </div>
          </div>
        }
        <div className="gt-user">
          {user ?
            <div className={isPopupVisible ? 'gt-user-inner is--poping' : 'gt-user-inner'} onClick={this.handlePopup}>
              <span className="gt-user-name">{user.login}</span>
              <Svg className="gt-ico-arrdown" name="arrow_down"/>
            </div> :
            <div className={isPopupVisible ? 'gt-user-inner is--poping' : 'gt-user-inner'} onClick={this.handlePopup}>
              <span className="gt-user-name">{this.i18n.t('anonymous')}</span>
              <Svg className="gt-ico-arrdown" name="arrow_down"/>
            </div>
          }
        </div>
      </div>
    )
  }

  render () {
    const { isIniting, isNoInit, isOccurError, errorMsg, isInputFocused } = this.state
    return (
      <div className={`gt-container${isInputFocused ? ' gt-input-focused' : ''}`}>
        {isIniting && this.initing()}
        {!isIniting && (
          isNoInit ? [
          ] : [
            this.meta()
          ])
        }
        {isOccurError && <div className="gt-error">
          {errorMsg}
        </div>}
        {!isIniting && (
          isNoInit ? [
            this.noInit()
          ] : [
            this.header(),
            this.comments()
          ])
        }
      </div>
    )
  }
}

module.exports = GitalkComponent
