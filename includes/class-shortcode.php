<?php
namespace PlintusProfileEditorPaperjs;

class Shortcode {
    public function init() {
        add_shortcode('plintus_editor', [$this, 'render_editor']);
        add_action('wp_enqueue_scripts', [$this, 'enqueue_scripts']);
    }

    private static $scripts_enqueued = false;

    public function enqueue_scripts() {
        // Загружаем только если на странице есть шорткод и скрипты еще не загружены
        global $post;
        if (self::$scripts_enqueued) {
            return;
        }

        if (!is_a($post, 'WP_Post') || !has_shortcode($post->post_content, 'plintus_editor')) {
            return;
        }

        self::$scripts_enqueued = true;

        // Загружаем React из CDN
        wp_enqueue_script(
            'react',
            'https://unpkg.com/react@18/umd/react.production.min.js',
            [],
            '18.2.0',
            true
        );

        wp_enqueue_script(
            'react-dom',
            'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
            ['react'],
            '18.2.0',
            true
        );

        // Загружаем Paper.js
        wp_enqueue_script(
            'paper',
            'https://unpkg.com/paper@0.12.17/dist/paper-full.min.js',
            [],
            '0.12.17',
            true
        );

        // Загружаем React редактор
        wp_enqueue_script(
            'plintus-profile-editor-paperjs-frontend',
            Plugin::get_url() . 'admin/js/editor.bundle.js',
            ['react', 'react-dom', 'paper'],
            Plugin::get_version(),
            true
        );

        wp_enqueue_style(
            'plintus-profile-editor-paperjs-admin',
            Plugin::get_url() . 'admin/css/admin.css',
            [],
            Plugin::get_version()
        );
    }

    public function render_editor($atts) {
        $atts = shortcode_atts([
            'id' => 0, // ID профиля
            'readonly' => 'false', // Режим только для чтения
        ], $atts);

        $profile_id = intval($atts['id']);
        $readonly = filter_var($atts['readonly'], FILTER_VALIDATE_BOOLEAN);

        // Если ID не указан, пытаемся получить из параметра запроса
        if ($profile_id === 0 && isset($_GET['profile_id'])) {
            $profile_id = intval($_GET['profile_id']);
        }

        // Если ID все еще не указан, возвращаем сообщение
        if ($profile_id === 0) {
            return '<div class="plintus-editor-error">' . 
                   __('Please specify profile ID: [plintus_editor id="123"]', 'plintus-profile-editor-paperjs') . 
                   '</div>';
        }

        // Проверяем существование профиля
        $post = get_post($profile_id);
        if (!$post || $post->post_type !== CPT::POST_TYPE) {
            return '<div class="plintus-editor-error">' . 
                   __('Profile not found', 'plintus-profile-editor-paperjs') . 
                   '</div>';
        }

        // Генерируем уникальный ID для контейнера
        $container_id = 'plintus-editor-' . $profile_id . '-' . wp_generate_password(8, false);

        // Передаем данные в JavaScript через data-атрибуты и inline скрипт
        $editor_data = [
            'apiUrl' => rest_url('plintus-paperjs/v1/'),
            'nonce' => wp_create_nonce('wp_rest'),
            'profileId' => $profile_id,
            'postId' => $profile_id,
            'readonly' => $readonly,
            'containerId' => $container_id,
            'strings' => [
                'lineTool' => __('Line Tool', 'plintus-profile-editor-paperjs'),
                'arcTool' => __('Arc Tool', 'plintus-profile-editor-paperjs'),
                'selectTool' => __('Select Tool', 'plintus-profile-editor-paperjs'),
                'deleteTool' => __('Delete', 'plintus-profile-editor-paperjs'),
            ],
        ];

        // Выводим контейнер для редактора и inline скрипт с данными
        ob_start();
        ?>
        <div id="<?php echo esc_attr($container_id); ?>" class="plintus-editor-container" 
             data-profile-id="<?php echo esc_attr($profile_id); ?>"
             data-readonly="<?php echo esc_attr($readonly ? 'true' : 'false'); ?>"></div>
        <script type="text/javascript">
            (function() {
                if (typeof window.plintusEditorInstances === 'undefined') {
                    window.plintusEditorInstances = {};
                }
                window.plintusEditorInstances['<?php echo esc_js($container_id); ?>'] = <?php echo wp_json_encode($editor_data); ?>;
                
                // Инициализируем редактор для этого контейнера
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', function() {
                        if (typeof window.initPlintusEditor === 'function') {
                            window.initPlintusEditor('<?php echo esc_js($container_id); ?>');
                        }
                    });
                } else {
                    if (typeof window.initPlintusEditor === 'function') {
                        window.initPlintusEditor('<?php echo esc_js($container_id); ?>');
                    }
                }
            })();
        </script>
        <?php
        return ob_get_clean();
    }
}

