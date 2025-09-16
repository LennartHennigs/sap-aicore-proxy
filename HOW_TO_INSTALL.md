# Setting up dev tools

You need to install `node`, `npm*`, `git`.
And I suggest to use `ìTerm`, a nice Terminal program.

## 1. Install Homebrew

 Install Homebrew (Apple Silicon) and set up your shell environment

```shell
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Add Homebrew to your PATH 
(the installer will show the exact commands)

```
follow the step shown by brew
```

## 2. Install iTerm (optional, but a sign of good taste)

Install iTerm2 via Homebrew Cask:

``` shell
brew install --cask iterm2
```

Now open iterm and continue there:

```
[CMD + Space] -> iTerm
```


## 3. Install GIT (if not already installed via macOS)

Install the GIT command line tool
```shell
brew install git
```


Go to the place where you want to have the folder
```shell
cd
cd Documents
```

Login into git

```shell
git config --global user.name "[Your Name]"
git config --global user.email "[your.email@example.com]"
```


Clone a repository

```shell
git clone git@github.com:LennartHennigs/sap-aicore-proxy.git
cd sap-aicore-proxy
```

Note: If the repository is private, you’ll be prompted for credentials. In that case use an access token or credentials as required by the host.

## 4. Install Node.js without nvm (via Homebrew)

```shell
brew install node
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
brew upgrade node
npm install -g npm@latest
```
