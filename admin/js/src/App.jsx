import React, { useEffect } from 'react';
import CanvasEditor from './components/Canvas/CanvasEditor';
import Toolbar from './components/Toolbar/Toolbar';
import VerticalToolbar from './components/Toolbar/VerticalToolbar';
import PropertiesPanel from './components/Sidebar/PropertiesPanel';
import { useEditorStore } from './store/useEditorStore';
import { loadProfileData, saveProfileData } from './utils/api';
import './App.css';

function App() {
    const { selectedElements, loadProfile } = useEditorStore();
    const profileId = window.plintusEditor?.profileId;

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

    // Автосохранение через таймер
    useEffect(() => {
        const interval = setInterval(() => {
            const { elements, grid, viewbox } = useEditorStore.getState();
            if (profileId && elements.length >= 0) {
                saveProfileData(profileId, { elements, grid, viewbox });
            }
        }, 5000); // Сохраняем каждые 5 секунд
        
        return () => clearInterval(interval);
    }, [profileId]);

    return (
        <div className="plintus-editor">
            <Toolbar />
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




