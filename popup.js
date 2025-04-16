document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM已加载');
  
  // 获取所有需要的DOM元素
  const getButton = document.getElementById('get-cookies');
  const toast = document.getElementById('toast');
  const startReplyBtn = document.getElementById('start-reply');
  const replyContentInput = document.getElementById('reply-content');
  const replyCountInput = document.getElementById('reply-count');

  console.log('获取到的按钮元素:', {
    getButton: !!getButton,
    startReplyBtn: !!startReplyBtn,
    replyContentInput: !!replyContentInput
  });

  function showToast(message) {
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(function() {
      toast.style.display = 'none';
    }, 2000);
  }

  getButton.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      var url = tabs[0].url;
      chrome.cookies.getAll({url: url}, function(cookies) {
        let cookiesText = '';
        for (var i = 0; i < cookies.length; i++) {
          var cookie = cookies[i];
          cookiesText += cookie.name + '=' + cookie.value + (i < cookies.length - 1 ? '; ' : '');
        }
        // 将获取到的 cookie 复制到剪切板
        navigator.clipboard.writeText(cookiesText).then(function() {
          showToast('Cookies copied to clipboard.');
        }, function(err) {
          console.error('Could not copy cookies to clipboard: ', err);
          showToast('Failed to copy cookies to clipboard.');
        });
      });
    });
  });

  // 添加自动回复按钮点击事件
  if (startReplyBtn) {
    startReplyBtn.addEventListener('click', function() {
      console.log('点击了自动回复按钮');
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        var url = tabs[0].url;
        console.log('当前标签页URL:', url);
        
        chrome.cookies.getAll({url: url}, function(cookies) {
          console.log('获取到cookies数量:', cookies.length);
          console.log('cookies名称列表:', cookies.map(c => c.name).join(', '));
          
          // 准备POST请求数据
          const requestData = {
            cookie: JSON.stringify(cookies),
            query_word: '#蓝V互关',
            reply_content: replyContentInput.value || '求关注',
            limit_cnt: parseInt(replyCountInput.value) || 5
          };

          console.log('准备发送的请求数据:', {
            ...requestData,
            cookie: '长度:' + requestData.cookie.length // 避免打印完整cookie
          });

          // 发送POST请求
          console.log('开始发送POST请求到:', 'https://pumptools.me/api/tools/auto_reply_and_follow');
          fetch('https://pumptools.me/api/tools/auto_reply_and_follow', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
          })
          .then(response => {
            console.log('收到响应状态:', response.status, response.statusText);
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
          })
          .then(result => {
            console.log('请求成功，完整响应数据:', result);
            showToast('自动回复请求已发送');
          })
          .catch(error => {
            console.error('请求失败，详细错误:', error);
            console.error('错误堆栈:', error.stack);
            showToast('自动回复请求失败: ' + error.message);
          });
        });
      });
    });
  } else {
    console.error('未找到自动回复按钮元素');
  }
});
