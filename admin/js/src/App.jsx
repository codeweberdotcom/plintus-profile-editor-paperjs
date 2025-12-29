import React, { useEffect } from 'react';
import CanvasEditor from './components/Canvas/CanvasEditor';
import VerticalToolbar from './components/Toolbar/VerticalToolbar';
import PropertiesPanel from './components/Sidebar/PropertiesPanel';
import { useEditorStore } from './store/useEditorStore';
import { loadProfileData, saveProfileData } from './utils/api';
import './App.css';

// Определяем, находимся ли мы в админке
// wpApiSettings может быть доступен и на фронтенде, поэтому проверяем URL
const IS_ADMIN = typeof window.location !== 'undefined' && window.location.href.includes('/wp-admin/');

function App() {
    const { selectedElements, loadProfile } = useEditorStore();
    
    // Определяем profileId и readonly из window.plintusEditor или window.plintusEditorInstances
    let profileId = window.plintusEditor?.profileId;
    let readonly = window.plintusEditor?.readonly === true || window.plintusEditor?.readonly === 'true';
    
    // Если это фронтенд (шорткод), данные могут быть в window.plintusEditorInstances
    if (!profileId && typeof window.plintusEditorInstances !== 'undefined') {
        // Пытаемся найти данные для текущего контейнера
        const containerId = document.querySelector('.plintus-editor-container')?.id;
        if (containerId && window.plintusEditorInstances[containerId]) {
            const editorData = window.plintusEditorInstances[containerId];
            profileId = editorData.profileId;
            readonly = editorData.readonly === true || editorData.readonly === 'true';
        }
    }

    useEffect(() => {
        // Загружаем данные профиля при монтировании
        if (profileId) {
            loadProfileData(profileId).then((response) => {
                if (response && response.data) {
                    loadProfile(response.data);
                }
            });
        }
    }, [profileId, loadProfile]);

    // Автосохранение через таймер (только если не readonly и есть nonce)
    useEffect(() => {
        // Не сохраняем в режиме только для чтения
        if (readonly) {
            return;
        }
        
        // Проверяем наличие nonce (работает и в админке, и в шорткоде)
        let hasNonce = false;
        if (window.plintusEditor?.nonce) {
            hasNonce = !!window.plintusEditor.nonce;
        } else if (typeof window.plintusEditorInstances !== 'undefined') {
            const containerId = document.querySelector('.plintus-editor-container')?.id;
            if (containerId && window.plintusEditorInstances[containerId]?.nonce) {
                hasNonce = !!window.plintusEditorInstances[containerId].nonce;
            }
        }
        
        // Автосохранение работает только если есть nonce (пользователь авторизован)
        // Это работает и в админке, и в шорткоде
        if (!hasNonce) {
            return; // Без nonce не сохраняем
        }
        
        const interval = setInterval(() => {
            const { elements, grid, viewbox } = useEditorStore.getState();
            if (profileId && elements.length >= 0) {
                saveProfileData(profileId, { elements, grid, viewbox });
            }
        }, 5000); // Сохраняем каждые 5 секунд
        
        return () => clearInterval(interval);
    }, [profileId, readonly]);

    return (
        <div className="plintus-editor">
            <div className="plintus-editor-header">
                <h1 className="plintus-editor-title">Конструктор профиля</h1>
            </div>
            <div className="plintus-editor-content">
                <VerticalToolbar />
                <div className="plintus-editor-canvas-wrapper">
                    <CanvasEditor />
                </div>
                <PropertiesPanel elements={selectedElements} />
            </div>
        </div>
    );
}

export default App;




