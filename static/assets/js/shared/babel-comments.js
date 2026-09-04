import {
  buildApiRoots,
  escapeHtml,
  readStorage,
  safeHttpUrl,
} from './site-core.js';

function flattenThreadChildren(comments) {
  comments.forEach(function(comment) {
    if (!comment.children || !comment.children.length) return;

    const flatChildren = [];
    (function collect(nodes) {
      nodes.forEach(function(node) {
        const nested = node.children || [];
        node.children = [];
        flatChildren.push(node);
        collect(nested);
      });
    })(comment.children);
    comment.children = flatChildren;
  });
  return comments;
}

function buildCommentAuthorMap(comments) {
  const byId = {};
  (function collect(nodes) {
    nodes.forEach(function(node) {
      byId[node.id] = node.username || 'Guest';
      if (node.children && node.children.length) {
        collect(node.children);
      }
    });
  })(comments || []);
  return byId;
}

function formatCommentTime(dateText) {
  const now = Date.now();
  const then = new Date(dateText).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';

  const date = new Date(dateText);
  const pad = function(n) {
    return n < 10 ? '0' + n : String(n);
  };
  return (
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate()) +
    ' ' +
    pad(date.getHours()) +
    ':' +
    pad(date.getMinutes())
  );
}

function resolveGravatarUrl(url, gravatarBase) {
  if (!url) return '';
  if (!gravatarBase) return url;
  return String(url).replace(
    /^https?:\/\/(?:www\.)?gravatar\.com\/avatar/i,
    gravatarBase + '/avatar'
  );
}

function renderSingleComment(comment, gravatarBase, authorById) {
  const root = document.createElement('div');
  root.className = 'babel-comment';
  root.dataset.id = comment.id;

  const avatarUrl = resolveGravatarUrl(comment.gravatar_url || '', gravatarBase);
  const website = safeHttpUrl(comment.website || '');
  const username = escapeHtml(comment.username || 'Guest');
  const authorHtml = website
    ? '<a class="author" href="' +
      escapeHtml(website) +
      '" target="_blank" rel="nofollow noopener">' +
      username +
      '</a>'
    : '<span class="author">' + username + '</span>';
  const replyToName =
    comment.parent_id && authorById ? authorById[comment.parent_id] : '';
  const replyToHtml = replyToName
    ? '<span class="reply-to">to ' + escapeHtml(replyToName) + '</span>'
    : '';
  const content = escapeHtml(comment.content || '').replace(/\n/g, '<br>');

  root.innerHTML =
    '<img class="avatar" src="' +
    escapeHtml(avatarUrl) +
    '" alt="">' +
    '<div class="babel-comment-body">' +
    '<div class="babel-comment-meta">' +
    authorHtml +
    replyToHtml +
    '<span class="time">' +
    formatCommentTime(comment.create_time) +
    '</span>' +
    '<button class="reply-btn" data-id="' +
    comment.id +
    '">Reply</button>' +
    '</div>' +
    '<div class="babel-comment-content">' +
    content +
    '</div>' +
    (comment.children && comment.children.length
      ? '<div class="babel-comment-children"></div>'
      : '') +
    '</div>';

  if (comment.children && comment.children.length) {
    const childContainer = root.querySelector('.babel-comment-children');
    comment.children.forEach(function(child) {
      childContainer.appendChild(
        renderSingleComment(child, gravatarBase, authorById)
      );
    });
  }

  return root;
}

export function initBabelComments(options) {
  const section = document.querySelector('.js-babel-section[data-comment-post-id]');
  if (!section) return;

  const roots = buildApiRoots(options && options.apiBase ? options.apiBase : '');
  const api = roots.babelApi;
  const gravatarBase = roots.gravatarApi;
  const postId = String(section.dataset.commentPostId || '').trim();
  if (!postId) return;

  const commentCounters = Array.from(
    document.querySelectorAll('.js-comment-count[data-comment-post-id]')
  ).filter(function(el) {
    return String(el.dataset.commentPostId || '').trim() === postId;
  });

  const commentsEl = document.getElementById('babel-comments');
  const titleEl = document.getElementById('babel-title');
  const formEl = document.getElementById('babel-form');
  const formWrapperEl = document.getElementById('babel-form-wrapper');
  const usernameEl = document.getElementById('babel-username');
  const emailEl = document.getElementById('babel-email');
  const websiteEl = document.getElementById('babel-website');
  const contentEl = document.getElementById('babel-content');
  const parentIdEl = document.getElementById('babel-parent-id');
  const cancelReplyEl = document.getElementById('babel-cancel-reply');
  const messageEl = document.getElementById('babel-msg');
  const paginationEl = document.getElementById('babel-pagination');

  if (
    !commentsEl ||
    !titleEl ||
    !formEl ||
    !formWrapperEl ||
    !usernameEl ||
    !emailEl ||
    !websiteEl ||
    !contentEl ||
    !parentIdEl ||
    !cancelReplyEl ||
    !messageEl ||
    !paginationEl
  ) {
    return;
  }

  const sectionParent = formWrapperEl.parentNode;
  let currentPage = 1;
  const pageSize = 20;

  function updateCommentCount(count) {
    commentCounters.forEach(function(el) {
      el.textContent = String(count);
    });
    titleEl.textContent = 'Comments' + (count ? ' (' + count + ')' : '');
  }

  function setFormMessage(message, isError) {
    const iconClass = isError
      ? 'fa-solid fa-circle-exclamation'
      : 'fa-solid fa-circle-check';
    messageEl.innerHTML =
      '<i class="' +
      iconClass +
      '" aria-hidden="true"></i><span>' +
      escapeHtml(message) +
      '</span>';
    messageEl.className = 'babel-form-msg' + (isError ? ' error' : '');
  }

  function renderPagination(current, total) {
    paginationEl.innerHTML = '';
    if (total <= 1) return;

    for (let i = 1; i <= total; i += 1) {
      const button = document.createElement('button');
      button.textContent = String(i);
      button.className = 'babel-page-btn' + (i === current ? ' active' : '');
      button.dataset.page = String(i);
      paginationEl.appendChild(button);
    }
  }

  function loadComments(page) {
    const targetPage = page || 1;
    currentPage = targetPage;

    fetch(
      api +
        '/comments/' +
        encodeURIComponent(postId) +
        '?status=approved&threaded=true&page=' +
        targetPage +
        '&page_size=' +
        pageSize
    )
      .then(function(res) {
        return res.json();
      })
      .then(function(res) {
        if (res.code !== 200) return;

        const comments = flattenThreadChildren(res.data || []);
        const authorById = buildCommentAuthorMap(comments);
        const count = Number(res.total_comments || res.total || comments.length || 0);
        const totalPages = Math.ceil(Number(res.total || comments.length || 0) / pageSize);

        updateCommentCount(count);
        commentsEl.innerHTML = '';

        if (!comments.length) {
          commentsEl.innerHTML =
            '<p class="babel-no-comments"><i class="fa-regular fa-comments" aria-hidden="true"></i><span>No comments yet.</span></p>';
          paginationEl.innerHTML = '';
          return;
        }

        comments.forEach(function(comment) {
          commentsEl.appendChild(
            renderSingleComment(comment, gravatarBase, authorById)
          );
        });
        renderPagination(currentPage, totalPages);
      })
      .catch(function() {
        updateCommentCount(0);
        commentsEl.innerHTML =
          '<p class="babel-no-comments"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>Failed to load comments.</span></p>';
        paginationEl.innerHTML = '';
      });
  }

  if (!api) {
    commentsEl.innerHTML =
      '<p class="babel-no-comments"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>Comment API unavailable.</span></p>';
    paginationEl.innerHTML = '';
    return;
  }

  usernameEl.value = readStorage('babel_username');
  emailEl.value = readStorage('babel_email');
  websiteEl.value = readStorage('babel_website');

  paginationEl.addEventListener('click', function(event) {
    if (!event.target.classList.contains('babel-page-btn')) return;
    const page = parseInt(event.target.dataset.page, 10);
    if (page && page !== currentPage) {
      loadComments(page);
      const anchor = document.getElementById('comments');
      if (anchor) {
        const container = document.querySelector('.container');
        if (container && container.contains(anchor)) {
          const containerRect = container.getBoundingClientRect();
          const anchorRect = anchor.getBoundingClientRect();
          const top = Math.max(
            0,
            container.scrollTop + (anchorRect.top - containerRect.top) - 10
          );
          container.scrollTo({ top: top, behavior: 'smooth' });
        } else {
          anchor.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
  });

  commentsEl.addEventListener('click', function(event) {
    if (!event.target.classList.contains('reply-btn')) return;

    const targetCommentId = event.target.dataset.id;
    parentIdEl.value = targetCommentId;
    const commentRoot = event.target.closest('.babel-comment');
    if (!commentRoot) return;

    const body = commentRoot.querySelector('.babel-comment-body');
    if (!body) return;
    body.appendChild(formWrapperEl);
    cancelReplyEl.style.display = 'inline';
    contentEl.focus();
  });

  cancelReplyEl.addEventListener('click', function() {
    parentIdEl.value = '';
    cancelReplyEl.style.display = 'none';
    sectionParent.insertBefore(formWrapperEl, commentsEl);
  });

  formEl.addEventListener('submit', function(event) {
    event.preventDefault();
    const submitButton = formEl.querySelector('button[type="submit"]');
    if (!submitButton) return;

    submitButton.disabled = true;
    messageEl.innerHTML = '';
    messageEl.className = 'babel-form-msg';

    const payload = {
      post_id: postId,
      username: usernameEl.value.trim(),
      email: emailEl.value.trim(),
      content: contentEl.value.trim(),
    };

    const website = websiteEl.value.trim();
    if (website) payload.website = website;

    if (parentIdEl.value) {
      payload.parent_id = parseInt(parentIdEl.value, 10);
    }

    try {
      if (window.localStorage) {
        localStorage.setItem('babel_username', payload.username);
        localStorage.setItem('babel_email', payload.email);
        localStorage.setItem('babel_website', website);
      }
    } catch (_) {}

    fetch(api + '/comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function(res) {
        return res.json();
      })
      .then(function(res) {
        submitButton.disabled = false;
        if (res.code === 201) {
          const status = res.data && res.data.status;
          if (status && status !== 'approved') {
            setFormMessage(
              'Your comment has been flagged as "' + status + '" and will not appear until reviewed.',
              true
            );
          } else {
            setFormMessage('Comment submitted successfully.', false);
          }

          contentEl.value = '';
          parentIdEl.value = '';
          cancelReplyEl.style.display = 'none';
          sectionParent.insertBefore(formWrapperEl, commentsEl);
          loadComments(1);
          return;
        }

        setFormMessage(res.msg || 'Failed to submit comment.', true);
      })
      .catch(function() {
        submitButton.disabled = false;
        setFormMessage('Network error. Please try again.', true);
      });
  });

  loadComments(1);
}
