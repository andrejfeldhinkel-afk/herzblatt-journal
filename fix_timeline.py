with open('src/pages/ueber-uns.astro') as f:
    content = f.read()

old_script = """  <script is:inline>
  (function() {
    var container = document.getElementById('timeline-container');
    if (!container) return;
    var line = document.getElementById('timeline-line');
    var items = container.querySelectorAll('.timeline-item');

    items.forEach(function(item) {
      item.style.opacity = '0.4';
      item.style.transform = 'translateX(8px)';
      item.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    });

    function animateTimeline() {
      var rect = container.getBoundingClientRect();
      var vh = window.innerHeight;
      var trigger = vh * 0.78;
      if (rect.top > trigger) return;
      var scrolled = trigger - rect.top;
      var progress = Math.min(Math.max(scrolled / rect.height, 0), 1);
      line.style.height = (progress * 100) + '%';
      items.forEach(function(item) {
        var r = item.getBoundingClientRect();
        var mid = r.top + r.height / 2;
        var dot = item.querySelector('.timeline-dot');
        var label = item.querySelector('p');
        var isLast = item.dataset.index === '4';
        if (mid < trigger) {
          dot.style.background = isLast ? 'var(--color-primary-600)' : 'var(--color-primary-500)';
          dot.style.borderColor = isLast ? 'var(--color-primary-200)' : 'var(--color-primary-100)';
          if (isLast) dot.style.boxShadow = '0 0 0 4px var(--color-primary-100)';
          label.style.color = 'var(--color-primary-600)';
          item.style.opacity = '1';
          item.style.transform = 'translateX(0)';
        } else {
          dot.style.background = 'var(--color-primary-100)';
          dot.style.borderColor = 'var(--color-primary-100)';
          dot.style.boxShadow = 'none';
          label.style.color = 'var(--text-muted)';
          item.style.opacity = '0.4';
          item.style.transform = 'translateX(8px)';
        }
      });
    }

    window.addEventListener('scroll', animateTimeline, { passive: true });
    setTimeout(animateTimeline, 100);
  })();
  </script>"""

new_script = """  <script is:inline>
  (function() {
    var container = document.getElementById('timeline-container');
    if (!container) return;
    var line = document.getElementById('timeline-line');
    var items = container.querySelectorAll('.timeline-item');
    var ticking = false;
    var currentProgress = 0;
    var targetProgress = 0;

    items.forEach(function(item) {
      item.style.opacity = '0.4';
      item.style.transform = 'translateX(8px)';
      item.style.transition = 'opacity 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    });

    line.style.transition = 'height 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94)';

    function animateTimeline() {
      var rect = container.getBoundingClientRect();
      var vh = window.innerHeight;
      var trigger = vh * 0.78;
      if (rect.top > trigger) {
        ticking = false;
        return;
      }
      var scrolled = trigger - rect.top;
      targetProgress = Math.min(Math.max(scrolled / rect.height, 0), 1);

      // Smooth interpolation for the line
      currentProgress += (targetProgress - currentProgress) * 0.12;
      if (Math.abs(currentProgress - targetProgress) < 0.001) currentProgress = targetProgress;
      line.style.height = (currentProgress * 100) + '%';

      items.forEach(function(item) {
        var r = item.getBoundingClientRect();
        var mid = r.top + r.height / 2;
        var dot = item.querySelector('.timeline-dot');
        var label = item.querySelector('p');
        var isLast = item.dataset.index === '4';
        if (mid < trigger) {
          dot.style.background = isLast ? 'var(--color-primary-600)' : 'var(--color-primary-500)';
          dot.style.borderColor = isLast ? 'var(--color-primary-200)' : 'var(--color-primary-100)';
          dot.style.transition = 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
          if (isLast) dot.style.boxShadow = '0 0 0 4px var(--color-primary-100)';
          label.style.color = 'var(--color-primary-600)';
          label.style.transition = 'color 0.4s ease';
          item.style.opacity = '1';
          item.style.transform = 'translateX(0)';
        } else {
          dot.style.background = 'var(--color-primary-100)';
          dot.style.borderColor = 'var(--color-primary-100)';
          dot.style.boxShadow = 'none';
          label.style.color = 'var(--text-muted)';
          item.style.opacity = '0.4';
          item.style.transform = 'translateX(8px)';
        }
      });

      if (Math.abs(currentProgress - targetProgress) > 0.001) {
        requestAnimationFrame(animateTimeline);
      } else {
        ticking = false;
      }
    }

    window.addEventListener('scroll', function() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(animateTimeline);
      }
    }, { passive: true });
    setTimeout(function() { ticking = true; requestAnimationFrame(animateTimeline); }, 100);
  })();
  </script>"""

content = content.replace(old_script, new_script)

with open('src/pages/ueber-uns.astro', 'w') as f:
    f.write(content)

print('Timeline animation smoothed with requestAnimationFrame + cubic-bezier easing')
