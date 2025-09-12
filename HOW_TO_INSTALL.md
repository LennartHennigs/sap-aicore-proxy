# Setting up dev tools

You need to install `node`, `npm*`, `git`.
And I suggest to use `ìTerm`, a nice Terminal program.

## 1. Install Homebrew

 Install Homebrew (Apple Silicon) and set up your shell environment

```shell
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Add Homebrew to your PATH (the installer will show the exact commands; typical for Apple Silicon):

```shell
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

## 2. Install iTerm

Install iTerm2 via Homebrew Cask:

``` shell
brew install --cask iterm2
```

## 3. Install GIT (if not already installed via macOS)

```shell
brew install git
```

Clone a repository using HTTP (no SSH keys)

```shell
git clone http://example.com/owner/repo.git
cd repo
```

Note: If the repository is private, you’ll be prompted for credentials. In that case use an access token or credentials as required by the host.

## 4. Install Node.js without nvm (via Homebrew)

```shell
brew install node
```

Verify installations

```shell
git --version
node -v
npm -v
```

Install project dependencies (example for a Node project)

```shell
npm install
```

If you need to switch Node versions later, consider using a local tool other than nvm (e.g., Homebrew-managed Node, or a project-specific installer). This guide avoids nvm as requested.

### 5. Updates  – just in case

Go to nodejs.org and download the desired installer (LTS recommended).
Run the installer (it updates both Node and npm).
Verify:

```shell
brew update
brew upgrade
node -v
npm -v
npm install -g npm@latest
```

## Quick reference commands (all in one glance)

- Install Homebrew and set PATH:

    ```shell
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
    eval "$(/opt/homebrew/bin/brew shellenv)"
    ```

- Git:

    ```shell
    brew install git
    git clone http://example.com/owner/repo.git
    ```

- Node:

    ```shell
    brew install node
    node -v
    npm -v
    ```

- Project setup:

    ```shell
    cd repo
    npm install
    ```

- Updates

    ```shell
    brew update
    brew upgrade
    node -v
    npm -v
    npm install -g npm@latest
    ```
