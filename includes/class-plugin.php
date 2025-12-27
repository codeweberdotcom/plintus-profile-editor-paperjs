<?php
namespace PlintusProfileEditorPaperjs;

class Plugin {
    private $cpt;
    private $admin;
    private $api;

    public function __construct() {
        $this->cpt = new CPT();
        $this->admin = new Admin();
        $this->api = new API();
    }

    public function init() {
        // Register CPT
        add_action('init', [$this->cpt, 'register']);

        // Register REST API
        add_action('rest_api_init', [$this->api, 'register_routes']);

        // Initialize admin
        if (is_admin()) {
            $this->admin->init();
        }

        // Load text domain
        add_action('plugins_loaded', [$this, 'load_textdomain']);
    }

    public function load_textdomain() {
        load_plugin_textdomain(
            'plintus-profile-editor-paperjs',
            false,
            dirname(PLINTUS_PROFILE_EDITOR_PAPERJS_BASENAME) . '/languages'
        );
    }

    public static function get_version() {
        return PLINTUS_PROFILE_EDITOR_PAPERJS_VERSION;
    }

    public static function get_path() {
        return PLINTUS_PROFILE_EDITOR_PAPERJS_PATH;
    }

    public static function get_url() {
        return PLINTUS_PROFILE_EDITOR_PAPERJS_URL;
    }
}






