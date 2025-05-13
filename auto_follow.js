(function(){
  function log(msg) {
    console.log('[AutoFollow]', msg);
  }
  function closeSelfTab(extra) {
    chrome.runtime.sendMessage(Object.assign({ action: 'closeMe' }, extra || {}), function() {
      window.close();
    });
  }
  function tryFollow(retry = 0) {
    log(`第${retry+1}次尝试查找关注按钮...`);
    
    // 先检查是否已经关注
    const unfollowButton = document.querySelector('button[data-testid$="-unfollow"][aria-label*="正在关注"], button[data-testid$="-unfollow"][aria-label*="Following"]');
    if (unfollowButton) {
      const username = unfollowButton.getAttribute('aria-label')?.split('@')[1];
      if (username) {
        log(`用户@${username}已经关注，跳过`);
        closeSelfTab({alreadyFollowed: true});
        return;
      }
    }

    const selectors = [
      'button[data-testid$="-follow"]',
      'button[aria-label*="关注"]',
      'button[aria-label*="Follow"]',
      'button:enabled'
    ];
    let btn = null;
    for (const sel of selectors) {
      const candidates = Array.from(document.querySelectorAll(sel));
      for (const candidate of candidates) {
        const text = candidate.innerText.trim();
        if (
          !candidate.disabled &&
          (text === '关注' || text === 'Follow' || text.includes('关注') || text.includes('Follow'))
        ) {
          btn = candidate;
          log(`找到关注按钮，选择器: ${sel}，文本: ${text}`);
          break;
        }
      }
      if (btn) break;
    }
    if (btn && !btn.disabled) {
      btn.scrollIntoView({behavior: 'smooth', block: 'center'});
      log('准备点击关注按钮...');
      btn.click();
      log('已点击关注按钮');
      setTimeout(() => {
        closeSelfTab();
      }, 2000);
    } else if (retry < 10) {
      log('未找到关注按钮，准备重试...');
      setTimeout(() => tryFollow(retry + 1), 1000);
    } else {
      log('未找到关注按钮，放弃');
      closeSelfTab({alreadyFollowed: true});
    }
  }
  if (document.readyState === 'complete') {
    setTimeout(() => tryFollow(0), 1000);
  } else {
    window.addEventListener('load', () => setTimeout(() => tryFollow(0), 1000));
  }
})(); 