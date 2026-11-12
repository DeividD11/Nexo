export class AppController {
  constructor(model, view, { authController, contactController, profileController, messageController, groupController, realtimeSyncController, attachmentController, notificationController, settingsController, searchController }) {
    this.model = model;
    this.view = view;
    this.auth = authController;
    this.contacts = contactController;
    this.profile = profileController;
    this.messages = messageController;
    this.groups = groupController;
    this.realtime = realtimeSyncController;
    this.attachments = attachmentController;
    this.notifications = notificationController;
    this.settings = settingsController;
    this.search = searchController;
    this.root = view.root;
  }

  mount() {
    this.root.addEventListener("click", (event) => this.onClick(event));
    this.root.addEventListener("submit", (event) => this.onSubmit(event));
    this.root.addEventListener("input", (event) => this.onInput(event));
    this.root.addEventListener("change", (event) => this.onChange(event));
    document.addEventListener("keydown", (event) => this.onKeydown(event));
    this.realtime?.mount();
    this.notifications?.mount();
  }

  async onClick(event) {
    const trigger = event.target.closest("[data-action]");
    if (!trigger) return;
    const action = trigger.dataset.action;
    switch (action) {
      case "open-auth": this.auth.open("login"); break;
      case "auth-mode": this.auth.open(trigger.dataset.mode); break;
      case "close-modal": this.model.update({ modal: null }); break;
      case "modal-backdrop": if (event.target === trigger) this.model.update({ modal: null }); break;
      case "new-chat": this.contacts.open(); break;
      case "new-group": this.groups.openCreate(); break;
      case "open-contacts": await this.contacts.openManager(); break;
      case "open-notifications": await this.notifications?.open(); break;
      case "mark-notification-read": await this.notifications?.markRead(trigger.dataset.id); break;
      case "notifications-read-all": await this.notifications?.markAllRead(); break;
      case "contacts-tab": this.model.update({ contactTab: trigger.dataset.tab }); break;
      case "add-contact": await this.contacts.add(trigger.dataset.id); break;
      case "respond-contact": await this.contacts.respond(trigger.dataset.id, trigger.dataset.decision); break;
      case "cancel-contact": await this.contacts.cancel(trigger.dataset.id); break;
      case "remove-contact": await this.contacts.remove(trigger.dataset.id); break;
      case "block-user": await this.contacts.block(trigger.dataset.id); break;
      case "unblock-user": await this.contacts.unblock(trigger.dataset.id); break;
      case "message-contact": await this.contacts.startConversation(trigger.dataset.id); break;
      case "open-profile": await this.profile.open(); break;
      case "delete-avatar": await this.profile.deleteAvatar(); break;
      case "open-settings": await this.settings?.open(); break;
      case "set-theme": this.model.setTheme(trigger.dataset.theme); break;
      case "logout": await this.auth.logout(); break;
      case "profile-menu": this.view.toggleProfileMenu(); break;
      case "refresh-conversations": await this.model.loadConversations(); break;
      case "open-conversation": {
        this.attachments?.disposePending();
        const conversation = this.model.state.conversations.find((item) => item.id === trigger.dataset.id);
        if (conversation) await this.model.openConversation(conversation);
        break;
      }
      case "open-notification-conversation": await this.search?.openConversation(trigger.dataset.id); break;
      case "open-search-conversation": await this.search?.openConversation(trigger.dataset.id); break;
      case "open-search-message": {
        const result = this.model.state.modal?.messageResults?.find((item) => item.id === trigger.dataset.id);
        if (result) await this.search?.openMessage(result);
        break;
      }
      case "back-to-list": this.attachments?.disposePending(); this.model.update({ activeConversation: null, messages: [], detailsOpen: false }); break;
      case "toggle-details": this.model.update({ detailsOpen: !this.model.state.detailsOpen }); break;
      case "close-details": this.model.update({ detailsOpen: false }); break;
      case "chat-menu": this.model.update({ detailsOpen: true }); break;
      case "load-earlier-messages": await this.messages.loadEarlier(); break;
      case "reply-message": this.messages.reply(trigger.dataset.id); break;
      case "cancel-reply": this.messages.cancelReply(); break;
      case "edit-message": this.messages.openEdit(trigger.dataset.id); break;
      case "delete-message": this.messages.confirmDelete(trigger.dataset.id); break;
      case "confirm-delete-message": await this.messages.deleteConfirmed(); break;
      case "react-message": await this.messages.react(trigger.dataset.id, trigger.dataset.emoji, trigger.dataset.remove === "true"); break;
      case "choose-attachment": this.root.querySelector("#chat-attachment-input")?.click(); break;
      case "remove-pending-attachment": await this.attachments?.removePending(trigger.dataset.id); break;
      case "open-attachment": {
        const message = this.model.state.messages.find((item) => item.attachments?.some((attachment) => attachment.id === trigger.dataset.id));
        const attachment = message?.attachments?.find((item) => item.id === trigger.dataset.id);
        if (attachment) await this.attachments?.open(attachment);
        break;
      }
      case "refresh-device-sessions": await this.settings?.reloadSessions(); break;
      case "revoke-device-session": await this.settings?.revoke(trigger.dataset.id); break;
      case "revoke-other-sessions": await this.settings?.revokeOthers(); break;
      case "manage-group": await this.groups.openManager(); break;
      case "delete-group-avatar": await this.groups.deleteAvatar(); break;
      case "group-remove-member": await this.groups.removeMember(trigger.dataset.id); break;
      case "group-set-role": await this.groups.setRole(trigger.dataset.id, trigger.dataset.role); break;
      case "group-leave": await this.groups.removeMember(this.model.state.user?.id); break;
      case "dismiss-error": this.model.update({ error: "" }); break;
      default: break;
    }
  }

  async onSubmit(event) {
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    event.preventDefault();
    switch (form.dataset.form) {
      case "login": case "register": case "recover": await this.auth.submit(form); break;
      case "profile-update": await this.profile.submit(form); break;
      case "profile-avatar": await this.profile.uploadAvatar(form); break;
      case "settings-update": await this.settings?.save(form); break;
      case "contact-search": await this.contacts.search(form); break;
      case "send-message": this.realtime?.stopTyping(); await this.messages.send(form); break;
      case "group-create": await this.groups.create(form); break;
      case "group-update": await this.groups.update(form); break;
      case "group-avatar": await this.groups.uploadAvatar(form); break;
      case "group-add-member": await this.groups.addMember(form); break;
      case "edit-message": await this.messages.edit(form); break;
      case "conversation-search": await this.search?.search(form); break;
      default: break;
    }
  }

  onInput(event) {
    if (event.target.id === "conversation-search-input") this.view.filterConversations(event.target.value);
    if (event.target.id === "message-input") this.realtime?.onTyping();
  }

  onChange(event) {
    if (event.target.matches("#chat-attachment-input")) {
      this.attachments?.uploadFromInput(event.target);
      return;
    }
    if (event.target.matches('input[name="avatar"]')) {
      const file = event.target.files?.[0] || null;
      if (event.target.closest('[data-form="group-avatar"]')) this.view.showGroupAvatarPreview(file);
      else this.view.showAvatarPreview(file);
    }
  }

  onKeydown(event) {
    if (this.model.state.modal && event.key === "Tab") this.view.trapModalFocus(event);
    if (event.key === "Escape" && this.model.state.modal) {
      this.model.update({ modal: null });
      return;
    }
    if (event.key === "Escape" && this.model.state.detailsOpen) {
      this.model.update({ detailsOpen: false });
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      this.view.focusConversationSearch();
    }
    if (event.target?.id === "message-input" && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.target.closest("form")?.requestSubmit();
    }
  }
}
