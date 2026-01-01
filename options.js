// options.js
document.addEventListener('DOMContentLoaded', function() {
  // 获取DOM元素
  const schemeSelect = document.getElementById('schemeSelect');
  const scheme1Content = document.getElementById('scheme1Content');
  const scheme2Content = document.getElementById('scheme2Content');
  const scheme3Content = document.getElementById('scheme3Content');
  const scheme1Rows = document.getElementById('scheme1Rows');
  const scheme2Rows = document.getElementById('scheme2Rows');
  const scheme3Rows = document.getElementById('scheme3Rows');
  const scheme1EditBtn = document.getElementById('scheme1EditBtn');
  const scheme2EditBtn = document.getElementById('scheme2EditBtn');
  const scheme3EditBtn = document.getElementById('scheme3EditBtn');
  const scheme1AddRowBtn = document.getElementById('scheme1AddRowBtn');
  const scheme2AddRowBtn = document.getElementById('scheme2AddRowBtn');
  const scheme3AddRowBtn = document.getElementById('scheme3AddRowBtn');
  const sensitivityValue = document.getElementById('sensitivityValue');
  const sensitivityPlus = document.getElementById('sensitivityPlus');
  const sensitivityMinus = document.getElementById('sensitivityMinus');
  const toggleShortcut = document.getElementById('toggleShortcut');
  const scheme1Shortcut = document.getElementById('scheme1Shortcut');
  const scheme2Shortcut = document.getElementById('scheme2Shortcut');
  const scheme3Shortcut = document.getElementById('scheme3Shortcut');
  const shortcutModal = document.getElementById('shortcutModal');
  const currentShortcutDisplay = document.getElementById('currentShortcutDisplay');
  const confirmShortcut = document.getElementById('confirmShortcut');
  const cancelShortcut = document.getElementById('cancelShortcut');

  // 存储当前编辑的快捷键输入框
  let currentEditingInput = null;

  // 默认方案设置
  const defaultSchemes = {
    1: [
      { min: 0, max: 25, speed: 1.0 },
      { min: 26, max: 100, speed: 2.0 }
    ],
    2: [
      { min: 0, max: 15, speed: 0.7 },
      { min: 16, max: 30, speed: 1.0 },
      { min: 31, max: 60, speed: 1.5 },
      { min: 61, max: 100, speed: 2.0 }
    ],
    3: [
      { min: 0, max: 10, speed: 0.5 },
      { min: 11, max: 25, speed: 1.0 },
      { min: 26, max: 50, speed: 1.5 },
      { min: 51, max: 75, speed: 2.0 },
      { min: 76, max: 100, speed: 2.5 }
    ]
  };

  // 默认灵敏度
  const defaultSensitivity = 3;

  // 默认快捷键
  const defaultShortcuts = {
    toggle: 'Alt+K',
    scheme1: 'Alt+1',
    scheme2: 'Alt+2',
    scheme3: 'Alt+3'
  };

  // 加载设置
  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['scheme', 'schemes', 'sensitivity', 'shortcuts']);
      
      // 设置当前方案
      const currentScheme = result.scheme || 1;
      schemeSelect.value = currentScheme;
      showSchemeContent(currentScheme);
      
      // 设置方案数据
      const schemes = result.schemes || defaultSchemes;
      renderSchemeRows(1, schemes[1] || defaultSchemes[1]);
      renderSchemeRows(2, schemes[2] || defaultSchemes[2]);
      renderSchemeRows(3, schemes[3] || defaultSchemes[3]);
      
      // 设置灵敏度
      const sensitivity = result.sensitivity || defaultSensitivity;
      sensitivityValue.textContent = sensitivity;
      
      // 设置快捷键
      const shortcuts = result.shortcuts || defaultShortcuts;
      toggleShortcut.value = shortcuts.toggle || defaultShortcuts.toggle;
      scheme1Shortcut.value = shortcuts.scheme1 || defaultShortcuts.scheme1;
      scheme2Shortcut.value = shortcuts.scheme2 || defaultShortcuts.scheme2;
      scheme3Shortcut.value = shortcuts.scheme3 || defaultShortcuts.scheme3;
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  }

  // 显示对应的方案内容
  function showSchemeContent(schemeNum) {
    scheme1Content.classList.remove('active');
    scheme2Content.classList.remove('active');
    scheme3Content.classList.remove('active');
    
    document.getElementById(`scheme${schemeNum}Content`).classList.add('active');
  }

  // 渲染方案行
  function renderSchemeRows(schemeNum, rows) {
    const container = document.getElementById(`scheme${schemeNum}Rows`);
    container.innerHTML = '';
    
    rows.forEach((row, index) => {
      const rowElement = createSchemeRow(schemeNum, index, row);
      container.appendChild(rowElement);
    });
  }

  // 创建方案行元素
  function createSchemeRow(schemeNum, index, rowData) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'scheme-row';
    rowDiv.dataset.index = index;
    
    rowDiv.innerHTML = `
      <input type="number" class="min-input" min="0" max="100" value="${rowData.min}" readonly>
      <span>~</span>
      <input type="number" class="max-input" min="0" max="100" value="${rowData.max}" readonly>
      <span>对应的播放速度：</span>
      <input type="number" class="speed-input" min="0.1" max="4.0" step="0.1" value="${rowData.speed}" readonly>
      <button class="remove-row-btn" style="display:none;">删除</button>
    `;
    
    // 添加事件监听器
    const minInput = rowDiv.querySelector('.min-input');
    const maxInput = rowDiv.querySelector('.max-input');
    const speedInput = rowDiv.querySelector('.speed-input');
    const removeBtn = rowDiv.querySelector('.remove-row-btn');
    
    minInput.addEventListener('change', function() {
      let value = parseInt(this.value);
      if (value < 0) value = 0;
      if (value > 100) value = 100;
      this.value = value;
    });
    
    maxInput.addEventListener('change', function() {
      let value = parseInt(this.value);
      if (value < 0) value = 0;
      if (value > 100) value = 100;
      this.value = value;
    });
    
    speedInput.addEventListener('change', function() {
      let value = parseFloat(this.value);
      if (value < 0.1) value = 0.1;
      if (value > 4.0) value = 4.0;
      // 保留一位小数
      this.value = value.toFixed(1);
    });
    
    removeBtn.addEventListener('click', function() {
      rowDiv.remove();
    });
    
    return rowDiv;
  }

  // 切换方案
  schemeSelect.addEventListener('change', function() {
    const schemeNum = parseInt(this.value);
    showSchemeContent(schemeNum);
    saveCurrentScheme(schemeNum);
  });

  // 保存当前方案
  async function saveCurrentScheme(schemeNum) {
    try {
      await chrome.storage.sync.set({ scheme: schemeNum });
    } catch (error) {
      console.error('保存当前方案失败:', error);
    }
  }

  // 验证方案数据
  function validateScheme(rows) {
    if (rows.length === 0) {
      alert('方案不能为空');
      return false;
    }
    
    // 检查第一行的左区间是否为0
    if (rows[0].min !== 0) {
      alert('第一行的变化幅度左区间必须为0');
      return false;
    }
    
    // 检查每一行的右区间是否比左区间大
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].min >= rows[i].max) {
        alert(`第${i + 1}行的变化幅度区间设置错误：右区间必须大于左区间`);
        return false;
      }
    }
    
    // 检查最后一行的右区间是否为100
    if (rows[rows.length - 1].max !== 100) {
      alert('最后一行的变化幅度右区间必须为100');
      return false;
    }
    
    // 检查区间是否连续且无重叠
    for (let i = 0; i < rows.length - 1; i++) {
      if (rows[i].max >= rows[i + 1].min) {
        alert(`第${i + 1}行和第${i + 2}行的区间有重叠或不连续`);
        return false;
      }
    }
    
    return true;
  }

  // 编辑方案按钮事件
  function setupEditButton(btn, schemeNum, addRowBtn) {
    let isEditing = false;
    
    btn.addEventListener('click', async function() {
      if (isEditing) {
        // 保存设置
        const rows = [];
        const container = document.getElementById(`scheme${schemeNum}Rows`);
        const rowElements = container.querySelectorAll('.scheme-row');
        
        rowElements.forEach(rowElement => {
          const minInput = rowElement.querySelector('.min-input');
          const maxInput = rowElement.querySelector('.max-input');
          const speedInput = rowElement.querySelector('.speed-input');
          
          rows.push({
            min: parseInt(minInput.value),
            max: parseInt(maxInput.value),
            speed: parseFloat(speedInput.value)
          });
        });
        
        // 验证方案数据
        if (!validateScheme(rows)) {
          return;
        }
        
        // 保存到存储
        try {
          const result = await chrome.storage.sync.get(['schemes']);
          const schemes = result.schemes || defaultSchemes;
          schemes[schemeNum] = rows;
          await chrome.storage.sync.set({ schemes: schemes });
          
          // 更新按钮文本
          btn.textContent = '进行编辑';
          isEditing = false;
          
          // 隐藏添加行按钮
          addRowBtn.style.display = 'none';
          
          // 禁用输入框和删除按钮
          rowElements.forEach(rowElement => {
            const inputs = rowElement.querySelectorAll('input');
            const removeBtn = rowElement.querySelector('.remove-row-btn');
            inputs.forEach(input => {
              input.setAttribute('readonly', true);
            });
            removeBtn.style.display = 'none';
          });
        } catch (error) {
          console.error('保存方案失败:', error);
        }
      } else {
        // 进入编辑模式
        btn.textContent = '保存设置';
        isEditing = true;
        
        const container = document.getElementById(`scheme${schemeNum}Rows`);
        const rowElements = container.querySelectorAll('.scheme-row');
        
        // 启用输入框和删除按钮
        rowElements.forEach(rowElement => {
          const inputs = rowElement.querySelectorAll('input');
          const removeBtn = rowElement.querySelector('.remove-row-btn');
          inputs.forEach(input => {
            input.removeAttribute('readonly');
          });
          removeBtn.style.display = 'inline-block';
        });
        
        // 显示添加行按钮
        addRowBtn.style.display = 'inline-block';
        
        // 添加添加行按钮事件
        addRowBtn.onclick = function() {
          const newRowData = { min: 1, max: 25, speed: 1.0 };
          const newRowElement = createSchemeRow(schemeNum, container.children.length, newRowData);
          container.appendChild(newRowElement);
          
          // 启用新行的输入框
          const inputs = newRowElement.querySelectorAll('input');
          inputs.forEach(input => {
            input.removeAttribute('readonly');
          });
          newRowElement.querySelector('.remove-row-btn').style.display = 'inline-block';
        };
      }
    });
  }

  // 设置编辑按钮
  setupEditButton(scheme1EditBtn, 1, scheme1AddRowBtn);
  setupEditButton(scheme2EditBtn, 2, scheme2AddRowBtn);
  setupEditButton(scheme3EditBtn, 3, scheme3AddRowBtn);

  // 灵敏度控制
  sensitivityPlus.addEventListener('click', async function() {
    let value = parseInt(sensitivityValue.textContent);
    if (value < 5) {
      value++;
      sensitivityValue.textContent = value;
      try {
        await chrome.storage.sync.set({ sensitivity: value });
      } catch (error) {
        console.error('保存灵敏度失败:', error);
      }
    }
  });

  sensitivityMinus.addEventListener('click', async function() {
    let value = parseInt(sensitivityValue.textContent);
    if (value > 1) {
      value--;
      sensitivityValue.textContent = value;
      try {
        await chrome.storage.sync.set({ sensitivity: value });
      } catch (error) {
        console.error('保存灵敏度失败:', error);
      }
    }
  });

  // 快捷键输入框点击事件
  function setupShortcutInput(input, key) {
    input.addEventListener('click', function() {
      currentEditingInput = { input: this, key: key };
      currentShortcutDisplay.textContent = this.value;
      shortcutModal.style.display = 'flex';
    });
  }

  setupShortcutInput(toggleShortcut, 'toggle');
  setupShortcutInput(scheme1Shortcut, 'scheme1');
  setupShortcutInput(scheme2Shortcut, 'scheme2');
  setupShortcutInput(scheme3Shortcut, 'scheme3');

  // 监听键盘事件来设置快捷键
  document.addEventListener('keydown', function(e) {
    if (shortcutModal.style.display === 'flex' && currentEditingInput) {
      e.preventDefault();
      
      // 检查是否包含修饰键
      if (e.altKey || e.ctrlKey || e.shiftKey) {
        let shortcut = '';
        
        if (e.altKey) shortcut += 'Alt+';
        if (e.ctrlKey) shortcut += 'Ctrl+';
        if (e.shiftKey) shortcut += 'Shift+';
        
        // 添加主键
        if (e.key.length === 1 || /^[0-9]$/.test(e.key)) {
          shortcut += e.key.toUpperCase();
        } else if (e.key === ' ') {
          shortcut += 'Space';
        } else if (e.key === 'ArrowUp') {
          shortcut += 'Up';
        } else if (e.key === 'ArrowDown') {
          shortcut += 'Down';
        } else if (e.key === 'ArrowLeft') {
          shortcut += 'Left';
        } else if (e.key === 'ArrowRight') {
          shortcut += 'Right';
        } else if (e.key.length === 1) {
          shortcut += e.key.toUpperCase();
        } else {
          shortcut += e.key;
        }
        
        currentShortcutDisplay.textContent = shortcut;
      }
    }
  });

  // 确认快捷键
  confirmShortcut.addEventListener('click', async function() {
    if (currentEditingInput) {
      const newShortcut = currentShortcutDisplay.textContent;
      currentEditingInput.input.value = newShortcut;
      
      try {
        const result = await chrome.storage.sync.get(['shortcuts']);
        const shortcuts = result.shortcuts || defaultShortcuts;
        shortcuts[currentEditingInput.key] = newShortcut;
        await chrome.storage.sync.set({ shortcuts: shortcuts });
      } catch (error) {
        console.error('保存快捷键失败:', error);
      }
    }
    
    shortcutModal.style.display = 'none';
    currentEditingInput = null;
  });

  // 取消快捷键设置
  cancelShortcut.addEventListener('click', function() {
    shortcutModal.style.display = 'none';
    currentEditingInput = null;
  });

  // 初始化设置
  loadSettings();
});