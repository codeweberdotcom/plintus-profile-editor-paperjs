import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Инициализация для админки (старый контейнер)
const adminContainer = document.getElementById('plintus-profile-editor-paperjs-root');
if (adminContainer && !adminContainer.dataset.initialized) {
    try {
        adminContainer.dataset.initialized = 'true';
        const root = ReactDOM.createRoot(adminContainer);
        root.render(<App />);
    } catch (error) {
        console.error('Error rendering React app:', error);
    }
}

// Инициализация для фронтенда (шорткод)
function initFrontendEditor(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    // Получаем данные из window.plintusEditorInstances
    if (typeof window.plintusEditorInstances === 'undefined' || 
        !window.plintusEditorInstances[containerId]) {
        return;
    }

    const editorData = window.plintusEditorInstances[containerId];
    
    // Устанавливаем глобальные данные для App компонента
    // Сохраняем оригинальные данные, если они есть
    const originalEditor = window.plintusEditor;
    window.plintusEditor = editorData;

    try {
        // Проверяем, не создан ли уже root для этого контейнера
        if (container.dataset.initialized === 'true') {
            return; // Уже инициализирован
        }
        
        container.dataset.initialized = 'true';
        const root = ReactDOM.createRoot(container);
        root.render(<App />);
        
        // Восстанавливаем оригинальные данные после рендеринга (если нужно)
        // Но на самом деле каждый компонент должен использовать свои данные
        // Поэтому оставляем последние установленные данные
    } catch (error) {
        console.error('Error rendering React app:', error);
        // Восстанавливаем оригинальные данные в случае ошибки
        if (originalEditor) {
            window.plintusEditor = originalEditor;
        }
    }
}

// Экспортируем функцию для вызова из inline скриптов
window.initPlintusEditor = initFrontendEditor;

// Инициализируем все редакторы на странице при загрузке
function initAllEditors() {
    if (typeof window.plintusEditorInstances === 'undefined') {
        return;
    }

    Object.keys(window.plintusEditorInstances).forEach(containerId => {
        const container = document.getElementById(containerId);
        if (container && !container.dataset.initialized) {
            container.dataset.initialized = 'true';
            initFrontendEditor(containerId);
        }
    });
}

// Инициализируем при загрузке DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllEditors);
} else {
    initAllEditors();
}






